const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Sign a release build with a real upload key instead of the debug one.
 *
 * `expo prebuild` generates `android/app/build.gradle` with the release build
 * type pointed at `signingConfigs.debug` and a comment saying not to ship it
 * like that. Nothing enforces the comment: the APK builds, installs and runs,
 * and the first time anybody finds out is when Play refuses the upload.
 *
 * The native project is generated rather than committed, so the change has to
 * live here — editing the file by hand would survive exactly until the next
 * `--clean`, and editing it in CI with sed would leave a local release build
 * quietly debug-signed.
 *
 * The four properties come from Gradle rather than from this file, so the
 * keystore and its passwords never enter the repository. Locally they go in
 * `~/.gradle/gradle.properties`; in CI they are passed with `-P` from secrets.
 * When they are absent the release build falls back to the debug key exactly as
 * before, which is what keeps the ordinary APK workflow working with no
 * credentials at all.
 *
 * Every edit below is asserted. A config plugin whose anchor has moved is a
 * plugin that silently does nothing, and doing nothing here means shipping a
 * debug-signed release — the failure this exists to prevent.
 */

const PROPERTY = 'XLEAGUE_UPLOAD_STORE_FILE';

const RELEASE_SIGNING_CONFIG = `
        release {
            // Only defined when the four properties are present. Gradle
            // evaluates this block whether or not it is used, so every line has
            // to tolerate their absence.
            if (project.hasProperty('${PROPERTY}')) {
                storeFile file(${PROPERTY})
                storePassword XLEAGUE_UPLOAD_STORE_PASSWORD
                keyAlias XLEAGUE_UPLOAD_KEY_ALIAS
                keyPassword XLEAGUE_UPLOAD_KEY_PASSWORD
            }
        }
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error(
        'withReleaseSigning: build.gradle is not Groovy any more. The signing ' +
          'config was not applied, and a release build would be signed with the ' +
          'debug key.',
      );
    }

    let gradle = mod.modResults.contents;

    // 1. Declare the signing config, immediately after the debug one.
    const debugConfig = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
`;
    if (!gradle.includes(debugConfig)) {
      throw new Error(
        'withReleaseSigning: could not find the generated debug signingConfig ' +
          'to add the release one after. Expo has changed the template.',
      );
    }
    gradle = gradle.replace(debugConfig, debugConfig + RELEASE_SIGNING_CONFIG);

    // 2. Point the release build type at it, when it is configured.
    const generated = `            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;
    if (!gradle.includes(generated)) {
      throw new Error(
        'withReleaseSigning: could not find the release build type still ' +
          'pointed at the debug key. Expo has changed the template, and this ' +
          'plugin can no longer promise a release build is signed properly.',
      );
    }
    gradle = gradle.replace(
      generated,
      `            // Signed with the upload key when one is configured, and with the
            // debug key when it is not — which is what keeps a credential-free
            // build of this repository working. The release workflow refuses to
            // publish anything carrying the debug certificate.
            signingConfig project.hasProperty('${PROPERTY}') ? signingConfigs.release : signingConfigs.debug`,
    );

    mod.modResults.contents = gradle;
    return mod;
  });
};
