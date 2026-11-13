# Security Specification for Plateforme Repas CHNCAK (Firestore & Auth)

This specification details the Attribute-Based Access Control (ABAC) rules, schema invariants, and boundary conditions enforced inside the Firestore rules.

## 1. Data Invariants

- **Users (`/users/{userId}`)**:
  - A user can only write/update their own profile information (`request.auth.uid == userId`).
  - To prevent self-assigned permissions and privilege escalation, users CANNOT change their own `role` or load arbitrary `walletBalance` amounts. The role must remain immutable or be managed only by system admins.
  - Profile reads must be restricted to the owner of the profile, delivery couriers, and hospital restaurant admins. No global profiling.

- **Meals (`/meals/{mealId}`)**:
  - Only restaurant admins (`role == 'restaurant_admin'`) can write, create or modify meal documents.
  - Employees have `read` permissions to browse available dishes.
  - Employees can vote on next-day dishes (`isNextDay` equals true), but the update MUST only modify the `votesNextDay` and `votedBy` fields, and the user can only vote for themselves (meaning `votedBy` array modification must be safe).

- **Orders (`/orders/{orderId}`)**:
  - Restricts `create` to signed-in users whose `request.auth.uid` matches the order's `employeeId`.
  - The initial status of the order MUST be `pending`.
  - A regular employee can only update their order to `cancelled` (if currently `pending`) or read their own orders.
  - Restaurant admins can read all orders and change status between logical flows (`pending` -> `preparing` -> `delivering` -> `delivered`, or cancel).
  - Courier drivers can read all orders and update status from `preparing` or `delivering` to `delivered`.
  - The `createdAt` timestamp must match the exact server-received time to prevent temporal faking.

- **Notifications (`/notifications/{notificationId}`)**:
  - Anyone signed-in can receive notifications.
  - A notification's `userId` field must match `request.auth.uid` to be read, or belong to a general role.
  - Updating a notification is restricted to marking as `read` (`read == true`) and can only be done by the recipient user.

---

## 2. The "Dirty Dozen" Threat Vectors (Malicious Payloads)

Here are the 12 attack vectors we are blocking:

1. **Privilege Escalation**: Attempting to create a user profile with `role: 'restaurant_admin'` on a normal registration.
2. **Digital Safe Cracking**: Trying to update `walletBalance` directly via the client to inject free FCFA credits.
3. **Identity Spoofing**: Submitting an order with `employeeId` set to a victim's user ID while authenticated as a different account.
4. **Phantom Foods**: Attempting to create a new Meal document as a normal employee.
5. **Negative Pricing Exploit**: Submitting a meal with a price of `-5000` or an order with negative checkout total.
6. **Double Voting Hack**: An employee attempting to artificially inflate `votesNextDay` to 100 on a dish without adding their ID to the `votedBy` list.
7. **Bypassing the Kitchen**: An employee attempting to directly update an order status straight to `delivered` to force delivery.
8. **Impersonating Modou (Livreur)**: A normal employee attempting to update another person's order status to `delivered` or `preparing`.
9. **Spamming Notifications**: A rogue client attempting to write or spam notifications to other arbitrary staff members.
10. **Shadow Field Injection**: Writing a meal document with an undocumented field `hiddenFlag: true` to bypass verification checks.
11. **Spoofed Order Dates**: Injecting historical timestamps into an order's `createdAt` field (e.g., set to yesterday) to argue for refunds.
12. **Malicious ID Poisoning (Denial of Wallet)**: Creating a meal with a 2MB document ID or huge string values to exceed index sizes or exhaust quotas.

---

## 3. Test Invariant Checkers
The accompanying `firestore.rules` checks ensure that permissions are denied across all 12 scenarios when evaluated on the server.
