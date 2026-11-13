# Guide Android Play Store - Repas CHNCAK

## Etat du projet

- Nom application: Repas CHNCAK
- Identifiant Android: sn.chncak.repas
- Dossier Android: android/
- Technologie: Capacitor + React/Vite + Firebase
- Target SDK: Android 16 / API 36

Le projet est deja configure pour Android. Il reste a installer/configurer Java et Android Studio pour generer le fichier a envoyer sur Play Store.

## Pre-requis a installer

1. Installer Android Studio depuis le site officiel Android Developers.
2. Pendant l'installation, garder coches:
   - Android SDK
   - Android SDK Platform
   - Android Virtual Device
   - Android SDK Build-Tools
3. Installer un JDK si Android Studio ne fournit pas Java dans le terminal.

## Verifier Java

Dans CMD:

```cmd
java -version
```

Si le message indique que Java est introuvable, configurer `JAVA_HOME`.

Exemple si Android Studio est installe avec JetBrains Runtime:

```cmd
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set PATH=%JAVA_HOME%\bin;%PATH%
java -version
```

Si ce dossier n'existe pas, installer Microsoft OpenJDK ou Temurin JDK 17/21, puis mettre `JAVA_HOME` vers le dossier du JDK.

## Generer un APK de test

L'APK sert a installer directement l'application sur un telephone Android pour tester.

```cmd
cd /d "C:\Users\Test\Documents\plateforme-repas-chncak"
npm run android:apk
```

Fichier genere:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

## Generer le fichier Play Store AAB

Le Play Store demande de preference un fichier `.aab`.

```cmd
cd /d "C:\Users\Test\Documents\plateforme-repas-chncak"
npm run android:aab
```

Fichier attendu:

```text
android\app\build\outputs\bundle\release\app-release.aab
```

## Signature Play Store

Pour publier officiellement:

1. Creer un compte Google Play Console.
2. Creer une nouvelle application.
3. Activer Play App Signing.
4. Creer une cle d'import/upload key dans Android Studio:
   - Build
   - Generate Signed App Bundle / APK
   - Android App Bundle
   - Create new key store
5. Garder le fichier `.jks` et les mots de passe dans un endroit tres securise.

Sans signature, Google Play refusera le fichier.

## Mise a jour de l'application

Important:

- L'application Android embarque la version web au moment du build.
- Si on publie seulement Firebase Hosting, l'APK deja installe ne se met pas toujours a jour comme le site web.
- Pour une vraie mise a jour Play Store, il faut:
  1. Modifier l'application.
  2. Refaire `npm run android:aab`.
  3. Augmenter `versionCode`.
  4. Envoyer le nouveau `.aab` dans Play Console.

## Commandes utiles

Synchroniser Android apres modification web:

```cmd
npm run android:sync
```

Ouvrir dans Android Studio:

```cmd
npm run android:open
```

Generer APK test:

```cmd
npm run android:apk
```

Generer AAB Play Store:

```cmd
npm run android:aab
```

