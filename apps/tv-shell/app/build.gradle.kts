// Fire OS WebView shell. Kotlin is compiled by AGP 9's built-in Kotlin support (no separate plugin).
plugins {
    id("com.android.application")
}

// Production page the shell opens (the live CloudFront stack). Override at build time: ./gradlew assembleDebug -PfirefitUrl=https://dxxxx.cloudfront.net/tv.html
val firefitUrl: String = (project.findProperty("firefitUrl") as String?) ?: "https://dctlk09e4uy0d.cloudfront.net/tv.html"

// One permanent signing key, so every build (laptop or CI release) can update the one installed before it. The key is
// never in the repo: CI gets it from the FIREFIT_KEYSTORE_B64 / FIREFIT_KEYSTORE_PASSWORD secrets (decoded to the path in
// FIREFIT_KEYSTORE); on the laptop it is ~/.android/firefit-release.jks with its password in firefit-release.pass.
// Without it, builds fall back to the machine's debug key (fine for development, can't update a release install).
val home: String = System.getProperty("user.home")
val keystoreFile = System.getenv("FIREFIT_KEYSTORE")?.let { file(it) } ?: file("$home/.android/firefit-release.jks")
val keystorePassword: String? = System.getenv("FIREFIT_KEYSTORE_PASSWORD")
    ?: file("$home/.android/firefit-release.pass").takeIf { it.exists() }?.readText()?.trim()

android {
    namespace = "app.firefit.tv"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.firefit.tv"
        minSdk = 25 // Fire OS 6 (Android 7.1); Fire OS 7 = API 28, Fire OS 8 = API 30
        targetSdk = 34
        versionCode = 3
        versionName = "1.0.2"
        buildConfigField("String", "FIREFIT_URL", "\"$firefitUrl\"")
    }

    signingConfigs {
        if (keystoreFile.exists() && keystorePassword != null) {
            create("firefit") {
                storeFile = keystoreFile
                storePassword = keystorePassword
                keyAlias = "firefit"
                keyPassword = keystorePassword
            }
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfigs.findByName("firefit")?.let { signingConfig = it }
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // Background music (looping, playlist, fades, audio focus); sound effects use the platform SoundPool
    implementation("androidx.media3:media3-exoplayer:1.11.1")
}
