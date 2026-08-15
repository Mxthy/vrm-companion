# VRM Companion — Character Presence Sandbox for Meta Quest 3

Built on reverse-engineered architecture from "Life with VRoid" v0.11.
Full backend API deployed and tested.

## Quick Start
1. Clone this repo
2. Open in Unity 2022.3.11f1
3. Import VRM/UniGLTF packages
4. Import Oculus SDK / OpenXR
5. Build APK for Quest 3 (or push to GitHub for CI build)

## Backend APIs (deployed & tested)
- `companionDialog` — LLM-powered dialog (Groq/Llama 3.1)
- `avatarManager` — Multi-avatar slot management
- `sessionManager` — Session persistence

Base URL: https://elowen-0ac850db.base44.app/functions/

## Components (build order)
1. SessionPersistenceController — save/load state
2. AvatarSlotManager — multi-avatar management
3. AutoFittingWizard — VRM calibration
4. PoseAnimationController — pose library
5. CompanionDialogController — LLM dialog
6. MRPassthroughManager — passthrough + occlusion

## CI/CD
GitHub Actions builds APK automatically on push.
See `.github/workflows/build-quest-apk.yml`

Required secrets for CI:
- UNITY_LICENSE or UNITY_SERIAL — Unity license
- ANDROID_KEYSTORE_BASE64 — Signing keystore (base64)
- ANDROID_KEYSTORE_PASS — Keystore password
- ANDROID_KEY_ALIAS_NAME — Key alias name
- ANDROID_KEY_ALIAS_PASS — Key alias password

## Architecture
See analysis/MASTER_DOCUMENT.md for full technical spec.
