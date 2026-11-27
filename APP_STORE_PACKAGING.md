# CREST & CARAT app packaging

The installable web app is available at `https://carat.evercrest.vip/app/` after deployment. iPhone and iPad visitors can add it from Safari. Compatible Android and desktop browsers can open their install prompt from the page. This path uses the storefront’s Cloudflare Pages plan.

Apple’s Developer Program generally costs US$99 per year. Google Play charges a US$25 one-time registration fee. The native projects can be built and tested locally with the free development tools. [Apple membership](https://developer.apple.com/programs/enroll/) · [Play Console signup](https://support.google.com/googleplay/android-developer/answer/6112435)

## 1. Prepare the shared app

1. Install Node.js 22.13 or newer. On a Mac, install Xcode 26 or later. For Android, install a current Android Studio, JDK 21, and the Android API 36 SDK. [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup)
2. Open a terminal at the repository root and run:

   ```sh
   npm ci
   npm run cap:sync
   ```

3. The sync command builds the storefront and copies it into both projects. Re-run it after changing any web code, approved images, or public environment values.
4. Deploy the website at `https://carat.evercrest.vip` before testing live forms or hosted checkout. The native app uses the production domain for these requests. The bundled catalog and guides can open without a connection. Checkout, order status, availability validation, and customer submissions require a connection.

## 2. Build and submit the iPhone and iPad app

1. Run `npm run cap:ios`. Let Xcode resolve the Swift packages.
2. Select the **App** target and confirm the bundle identifier is `vip.evercrest.carat`. Choose a simulator and run the app to test the storefront.
3. For distribution, select the Apple Developer team authorized to sign CREST & CARAT under **Signing & Capabilities**. Register `vip.evercrest.carat` in Apple Developer and enable Associated Domains. The Release configuration includes `applinks:carat.evercrest.vip` in `ios/App/App/App.entitlements`.
4. Replace `REPLACE_WITH_APPLE_TEAM_ID` in `public/.well-known/apple-app-site-association` with the actual team ID and deploy. Open an eligible collection or product link from Messages or Notes on a signed test device. [Apple Associated Domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
5. Create the app in App Store Connect, supply screenshots from the actual build, and enter the production support and privacy URLs. Complete the App Privacy questionnaire using the form data and services deployed at release.
6. Select a distribution destination in Xcode, choose **Product → Archive**, and upload through the Organizer. Test the build with TestFlight. Submit the tested build for review with steps for reaching the catalog, concierge, and hosted checkout when it is enabled. [Apple submission requirements](https://developer.apple.com/app-store/submitting/)

## 3. Build and submit the Android app

1. Run `npm run cap:android`. In Android Studio, verify the Gradle JDK is 21 and install any requested SDK packages. Run on a connected phone or emulator.
2. Create the app in Play Console with the package name `vip.evercrest.carat`. Enroll in Play App Signing. Create and securely store the upload key outside the repository.
3. Select **Build → Generate Signed Bundle / APK → Android App Bundle**, select the release variant, and sign using the upload key.
4. In Play Console, copy the **App signing key certificate** SHA-256 fingerprint. Replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` in `public/.well-known/assetlinks.json` and deploy. The upload key fingerprint is for signing uploads. Android App Links checks the key that signs the installed build. [Android App Links](https://developer.android.com/training/app-links/verify-android-applinks)
5. Upload the `.aab` to an internal test track. Test approved deep links with a Play-signed install. Complete the store listing, Data safety form, and the testing or verification requirements shown in your Play Console before applying for production access. [Play release setup](https://support.google.com/googleplay/android-developer/answer/9859348)

## 4. Verify store links and the release build

1. Confirm both association files respond over HTTPS with status 200 and a JSON content type. Check that the Apple team ID and Play signing fingerprint match your distribution builds.

   ```sh
   curl -fsSI https://carat.evercrest.vip/.well-known/apple-app-site-association
   curl -fsSI https://carat.evercrest.vip/.well-known/assetlinks.json
   ```

2. On physical iOS and Android devices, test a cold launch from a product link, internal navigation after opening that link, offline browsing, reconnecting, the concierge form, and external checkout when a verified product is available. Match the store disclosures to the types of customer information the release collects.
3. After each listing becomes public, set `VITE_IOS_APP_STORE_URL` to its official `https://apps.apple.com/…/id…` URL and `VITE_GOOGLE_PLAY_URL` to its official `https://play.google.com/store/apps/details?id=vip.evercrest.carat` URL in the Cloudflare Pages build environment. Rebuild and deploy. Open each download button on `/app/` and in the site footer from a phone.
4. Increment the iOS build number and the Android `versionCode` for future uploads. Run `npm run cap:sync` before creating each new native release.
