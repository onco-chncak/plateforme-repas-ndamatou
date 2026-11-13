# QZ Local Signer CHNCAK

Ce dossier permet de tester une signature locale gratuite pour QZ Tray sur le poste restaurant.

## Objectif

Eviter les autorisations repetitives QZ Tray pour l'impression automatique des tickets.

## Installation sur le PC restaurant

1. Installer QZ Tray.
2. Installer Node.js si ce n'est pas deja fait.
3. Generer le certificat et la cle :

```powershell
cd "C:\Users\Test\Documents\plateforme-repas-chncak\qz-local-signer"
powershell -ExecutionPolicy Bypass -File .\generate-self-signed.ps1
```

4. Configurer QZ Tray pour faire confiance au certificat `digital-certificate.txt`.

Selon la version QZ Tray, utilisez l'interface de configuration avancee de QZ Tray ou la procedure officielle `authcert.override` / certificat override.

Documentation QZ :
- https://qz.io/docs/signing
- https://qz.io/docs/provisioning

5. Lancer le service local :

```bat
cd /d "C:\Users\Test\Documents\plateforme-repas-chncak\qz-local-signer"
start-signer.bat
```

6. Verifier dans le navigateur du PC restaurant :

```text
http://127.0.0.1:8182/health
```

7. Dans l'application, compte admin :

- Nom imprimante ticket : nom Windows exact de l'imprimante
- URL certificat QZ local : `http://127.0.0.1:8182/certificate`
- URL signature QZ locale : `http://127.0.0.1:8182/sign`
- Cliquer `Test QZ signé`

## Securite

Ne jamais mettre `private-key.pem` dans Firebase, GitHub ou dans l'application web.
La cle privee doit rester uniquement sur le PC restaurant.
