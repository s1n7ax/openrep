# Releasing to GitHub, Google Play and F-Droid

Releases are automated. This page explains what happens on every release
and lists the **one-time setup** the maintainer does by hand in Google Play
Console, Google Cloud, GitHub and F-Droid. Those steps need the maintainer's
own accounts, so no workflow can do them.

## What happens on every release

1. Conventional Commits land on `main`. release-please keeps a release pull
   request open with the next version and its `CHANGELOG.md` section
   (`.github/workflows/release.yml`, job `release-please`).
2. The `store-files` job adds the version's store files to that pull request
   (`npm run release:store-files`):
   - `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`, the
     "what's new" text both stores show, made from the new `CHANGELOG.md`
     section (plain text, at most 500 characters; longer notes end with a
     link to the GitHub release);
   - the version fields of the F-Droid recipe `fdroid/build-metadata.yml`.

   They must be in the release tag, so the pull request is a **draft**
   whenever they may be missing: it starts as one, and every run of the
   release workflow turns it back into one before release-please updates it.
   GitHub does not merge drafts. Once the files are in, the `store-files` job
   marks it **ready for review**, usually a minute or two after each push to
   `main`. Wait for that; do not mark it ready yourself.

3. Merging the pull request tags `vX.Y.Z` and creates the GitHub release. The
   `release-tag` job checks that the tag has its store files.
4. The `android` job builds the release from the tag, signs the APK with the
   release key and attaches `OpenRep-X.Y.Z.apk` and its `.sha256` to the
   release. Then it builds the signed AAB, checks that its certificate is the
   APK's and keeps it as the run's `openrep-aab` artifact for 30 days.
5. The `play` job uploads the AAB to Google Play's **production** track,
   released to **all users** (no staged rollout). The same Play edit sets the
   release notes from the changelog file and pushes the store listing (title,
   descriptions, icon, feature graphic, screenshots) from
   `fastlane/metadata/android/en-US/`. The edit is committed at the very end,
   so a failed upload changes nothing on Google Play.
6. F-Droid's update checker finds the new tag on its own, builds the app from
   source with the recipe and signs it with F-Droid's key. Nothing has to be
   done per release. F-Droid usually publishes within a few days.

versionName is the version. versionCode is major × 10000 + minor × 100 +
patch (`android/app/build.gradle`), so 1.2.3 is 10203.

### When a release tag lacks its store files

The `release-tag` job fails with "vX.Y.Z lacks its store files". That happens
only if the release pull request was merged while its store files were
missing: it was marked ready by hand too early, or turning it into a draft
failed (a warning on the `release-please` job). F-Droid's update checker reads
the versionCode from the recipe in the tag, so it does not see this release,
and `npm test` fails on `main` until the files are there. Google Play is not
affected: the `play` job writes missing release notes itself.

To recover, open a pull request from a branch of `main` with the output of
`npm run release:store-files`, titled for example
`fix(release): store files for X.Y.Z`, and merge it. As a `fix`, it starts the
next (patch) release, which has its store files; F-Droid builds that one and
skips X.Y.Z.

### When the Google Play upload fails

The `play` job fails with an error that says why, for example a missing
secret or the Play API's answer. The GitHub release and its APK are not
touched: they are published before the AAB is built, by a different job.

Fix the cause, then open the release run (Actions → Release) and choose
**Re-run failed jobs**. The job re-uploads the same AAB from the run's
artifacts, without a new release. This works for 30 days after the run. Use
"Re-run failed jobs", not "Re-run all jobs": a full re-run starts again from
release-please, which sees the release as already made and skips the builds.

Re-running a `play` job that already succeeded fails: Google Play does not
accept the same versionCode twice.

## Repository secrets

GitHub → the repository → Settings → Secrets and variables → Actions →
**New repository secret**.

| Secret                      | Used by   | What it is                                                                                      |
| --------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | `android` | The release keystore, base64-encoded (`base64 -w0 release.keystore`).                           |
| `ANDROID_KEYSTORE_PASSWORD` | `android` | The keystore's password.                                                                        |
| `ANDROID_KEY_ALIAS`         | `android` | The alias of the signing key in the keystore.                                                   |
| `ANDROID_KEY_PASSWORD`      | `android` | The key's password.                                                                             |
| `PLAY_SERVICE_ACCOUNT_JSON` | `play`    | The whole JSON key file of the Google Cloud service account (see [step 8](#8-service-account)). |

The first four are the ones the GitHub APK already uses; they also sign the
AAB. Without
`PLAY_SERVICE_ACCOUNT_JSON`, every release still publishes the GitHub APK;
only the `play` job fails, naming the missing secret.

F-Droid needs no secret: it builds from the public repository.

## Google Play: one-time setup

Do these in order. Menu names are Play Console's as of October 2026; Google
moves them now and then.

### 1. Developer account

1. Go to https://play.google.com/console/signup and sign in with the Google
   account that will own the app.
2. Choose a personal or organisation account, pay the one-time registration
   fee and complete identity verification. Google also verifies a contact
   phone number and email address.

A **personal account created after 13 November 2023** must run a closed test
before it can publish to production (step 9).

### 2. Create the app

1. Play Console → **Create app**.
2. App name: `OpenRep`. Default language: **English (United States) – en-US**
   (the listing lives in `fastlane/metadata/android/en-US/`). App or game:
   **App**. Free or paid: **Free**.
3. Accept the declarations and create the app.

The package name `io.github.s1n7ax.openrep` is fixed by the first AAB you
upload (step 9) and can never change.

### 3. Play App Signing with the existing release key

Google Play signs the APKs it delivers with the app signing key. It must be
the existing release key, so installs from Google Play and from GitHub
Releases update each other. New apps default to a key Google generates; change
that **before the first release**, because it cannot be changed after one is
rolled out in open testing or production.

1. Play Console → the app → **Test and release → App integrity → Play app
   signing** (also under Protected with Play → Play Store distribution).
2. Choose **Change app signing key**, then **Provide a copy of your app
   signing key** (export and upload a key from a Java keystore).
3. Download the PEPK tool (`pepk.jar`) and the encryption public key that the
   page offers.
4. On a computer with the release keystore and Java 11 or newer, run the
   command the page shows. It looks like:

   ```sh
   java -jar pepk.jar --keystore=release.keystore --alias=<ANDROID_KEY_ALIAS> \
     --output=openrep-signing-key.zip --include-cert --rsa-aes-encryption \
     --encryption-key-path=encryption_public_key.pem
   ```

   Enter the keystore and key passwords when asked.

5. Upload `openrep-signing-key.zip` and save. Delete the zip afterwards.

**Upload key.** The release workflow signs the AAB with the same release
key, so it is also the upload key: the first AAB you upload (step 9) registers
it. Google recommends a separate upload key, but the release key is in CI for
the GitHub APK anyway, so a second key would add secrets without protecting
anything more. If the upload key is ever compromised, Play Console → App
integrity → **Request upload key reset**.

**Check it.** After step 9, App integrity → Play app signing shows the **App
signing key certificate** and the **Upload key certificate**. Both SHA-256
fingerprints must equal the GitHub APK's:

```sh
apksigner verify --print-certs OpenRep-X.Y.Z.apk | grep SHA-256
```

### 4. Store listing details Play does not take from the repository

The workflow uploads the title, descriptions and images. These you set once:

1. **Grow users → Store presence → Store settings**: App category
   **Health & Fitness**; contact details: an email address (required, shown on
   the listing) and the website `https://github.com/s1n7ax/openrep`.
2. **Grow users → Store presence → Main store listing**: fill it in once by
   hand if Play Console requires it before the first release; every release
   overwrites it from `fastlane/metadata/android/en-US/`. (Title, short and
   full description: the `.txt` files there. App icon: `images/icon.png`.
   Feature graphic: `images/featureGraphic.png`. Phone screenshots:
   `images/phoneScreenshots/`.)

### 5. Privacy policy

**Policy and programs → App content → Privacy policy**, URL:

```text
https://github.com/s1n7ax/openrep/blob/main/docs/privacy-policy.md
```

The full description in the listing links the same page
([docs/privacy-policy.md](privacy-policy.md)).

### 6. App content questionnaires

**Policy and programs → App content.** Answers for this app (it has no
account, no ads, no analytics and collects no data):

| Declaration                 | Answer                                                                                                                                                                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App access                  | All functionality is available without special access.                                                                                                                                                                                                                       |
| Ads                         | No, the app does not contain ads.                                                                                                                                                                                                                                            |
| Content rating              | Fill in the IARC questionnaire with your email address. Category: "Utility, Productivity, Communication, or Other". No violence, sexuality, language, controlled substances, gambling or user-generated content shared in the app; no purchases. Expect "Everyone" / PEGI 3. |
| Target audience and content | Choose the age groups you want (for example 13 and over). Including under-13 groups brings in the Families policy requirements.                                                                                                                                              |
| Data safety                 | "Does your app collect or share any of the required user data types?" **No**. The summary then reads "No data collected" and "No data shared". (Downloading the public catalog sends no user data; Submit opens GitHub in the browser.)                                      |
| Advertising ID              | No, the app does not use an advertising ID.                                                                                                                                                                                                                                  |
| Health apps                 | The app has fitness features (workout plans and logging): choose the fitness/activity category; it does not use Health Connect or any health permission.                                                                                                                     |
| Government apps             | No.                                                                                                                                                                                                                                                                          |
| Financial features          | None.                                                                                                                                                                                                                                                                        |
| News apps                   | No.                                                                                                                                                                                                                                                                          |

Answer anything else Play Console adds the same way: the app has no account,
collects nothing and has no ads.

### 7. Countries and publishing settings

1. **Test and release → Production → Countries / regions**: add the countries
   to publish in (for example all).
2. **Publishing overview → Managed publishing**: leave it **off**. With it on,
   each release waits for a manual "Publish" click.

### 8. Service account

The workflow signs in to the Google Play Developer API as a service account.

1. Google Cloud Console (https://console.cloud.google.com), signed in as the
   Play Console account owner: create a project (for example `openrep-release`)
   or pick one.
2. **APIs & Services → Library**: enable the **Google Play Android Developer
   API**.
3. **IAM & Admin → Service accounts → Create service account**: name
   `openrep-release`. Grant it no Google Cloud roles.
4. Open the service account → **Keys → Add key → Create new key → JSON**. A
   JSON file downloads; it is the credential, keep it secret.
5. Play Console → **Users and permissions → Invite new users**: the service
   account's email address (`…@….iam.gserviceaccount.com`). Under **App
   permissions** add OpenRep with:
   - View app information (read-only);
   - Release to production, exclude devices, and use Play App Signing;
   - Release apps to testing tracks;
   - Manage store presence (the listing texts and images).

   No account permissions. Send the invitation (service accounts need no
   acceptance).

6. GitHub: add the repository secret `PLAY_SERVICE_ACCOUNT_JSON` with the
   **whole content** of the JSON file. Then delete the file.

### 9. First upload and closed testing

Google Play does not let the API upload the very first build of a new app, and
a new personal account must pass a closed test before production.

1. Get an AAB of the latest release: Actions → Release → the run of that
   release → Artifacts → `openrep-aab` (kept 30 days; unzip it to get
   `app-release.aab`). Or build one locally with the release key:
   `npm run build && npx cap sync android`, then in `android/`
   `ANDROID_KEYSTORE_FILE=… ANDROID_KEYSTORE_PASSWORD=… ANDROID_KEY_ALIAS=… ANDROID_KEY_PASSWORD=… ./gradlew bundleRelease`
   (`android/app/build/outputs/bundle/release/app-release.aab`).
2. **Test and release → Testing → Closed testing** (or Internal testing for an
   organisation account) → create a track or use "Alpha" → **Create new
   release** → upload the AAB → release notes: paste
   `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt` → save, review
   and roll out. This upload registers the package name and the upload key
   (step 3).
3. Personal accounts created after 13 November 2023: add at least **12
   testers** (a Google Group or email list) to the closed test, share the
   opt-in link, and keep at least 12 of them opted in for **14 days in a
   row**. Then **Dashboard → Apply for production** and answer Google's
   questions about the test. Google's review usually takes a few days.
4. Until production access is granted, the `play` job of each release fails
   (Google Play rejects production uploads) while the GitHub releases keep
   working. Once access is granted, re-run the failed `play` job of the latest
   release (within 30 days) or wait for the next release.

From then on, every release reaches production with no manual step.

## F-Droid: one-time setup

F-Droid builds the app itself from the source tag and signs it with
F-Droid's own key, so **F-Droid installs and GitHub/Google Play installs cannot
update each other**. Switching between them means uninstalling first: export
a backup (Settings → Backup) before, import it after.

The recipe is [`fdroid/build-metadata.yml`](../fdroid/build-metadata.yml)
(fdroiddata's metadata format). Every release rewrites its `Builds` entry and
`CurrentVersion`/`CurrentVersionCode` to that release, so the copy on `main`
is always ready to submit. F-Droid's update checker reads the versionCode
from that file at each new tag (`UpdateCheckData`), because `build.gradle`
computes it. The listing F-Droid shows (title, descriptions, icon, feature
graphic, screenshots, "what's new") comes from
`fastlane/metadata/android/en-US/` in the tag.

The build installs Node.js 22 from nodejs.org (checksum-verified), runs
`npm ci`, `npm run build` and `npx cap sync android` in the repository root,
then F-Droid's Gradle build in `android/app`. `scandelete: node_modules/`
removes the prebuilt binaries of build tools (esbuild, sharp, WebAssembly
files) after the web build and before Gradle; none of them ends up in the app.

### 1. Wait for a release with the recipe

Submit after the first release that contains `fdroid/build-metadata.yml` and
`fastlane/metadata/`, so the recipe points at a tag F-Droid can build.

### 2. Optional: check the recipe locally

With Docker and a clone of fdroidserver
(`git clone https://gitlab.com/fdroid/fdroidserver.git`), F-Droid's build
server image `registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie` runs
the same build: add the recipe as `metadata/io.github.s1n7ax.openrep.yml` to a
clone of fdroiddata (its `config/` is what `fdroid lint` checks against) and
run `fdroid lint`, `fdroid rewritemeta` and
`fdroid build --on-server --test io.github.s1n7ax.openrep:<versionCode>`
there, following fdroiddata's `.gitlab-ci.yml` job `fdroid build`. The
fdroiddata merge request's CI runs the same checks, so this step can be
skipped.

### 3. Open the inclusion merge request

1. Create a GitLab account and fork https://gitlab.com/fdroid/fdroiddata.
2. In the fork, create a branch `io.github.s1n7ax.openrep` and add the recipe
   as `metadata/io.github.s1n7ax.openrep.yml`:

   ```sh
   git clone https://gitlab.com/<you>/fdroiddata.git && cd fdroiddata
   git switch -c io.github.s1n7ax.openrep
   curl -fLo metadata/io.github.s1n7ax.openrep.yml \
     https://raw.githubusercontent.com/s1n7ax/openrep/main/fdroid/build-metadata.yml
   git add metadata/io.github.s1n7ax.openrep.yml
   git commit -m "New app: OpenRep"
   git push -u origin io.github.s1n7ax.openrep
   ```

3. Open a merge request to `fdroid/fdroiddata` with the **App inclusion**
   template and tick its checklist: the app is GPL-3.0-only, has no non-free
   dependencies, no tracking or ads, and no anti-features.
4. Answer the reviewers on the merge request. Inclusion time is up to
   F-Droid's maintainers.

After the merge, F-Droid builds and publishes each new `vX.Y.Z` tag on its
own.

## Maintaining the store listing

- Texts: `fastlane/metadata/android/en-US/title.txt` (at most 30
  characters), `short_description.txt` (80) and `full_description.txt`
  (4000), without a final newline. `npm test` checks the limits.
- Icon and feature graphic: `npm run generate:app-assets` renders them from
  `resources/icon.svg`.
- Screenshots: `npm run generate:store-screenshots` takes them from the app
  (1080 × 1920, needs Playwright's Chromium).
- "What's new": written from the commit messages, so keep the subjects of
  `feat` and `fix` commits readable for users.

Changes reach Google Play with the next release and F-Droid with the next
tag.
