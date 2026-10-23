// Fire OS WebView shell. Kotlin is compiled by AGP 9's built-in Kotlin support (no separate plugin).
plugins {
    id("com.android.application")
}

// Production page the shell opens (the live CloudFront stack). Override at build time: ./gradlew assembleDebug -PfirefitUrl=https://dxxxx.cloudfront.net/tv.html
val firefitUrl: String = (project.findProperty("firefitUrl") as String?) ?: "https://dctlk09e4uy0d.cloudfront.net/tv.html"

android {
    namespace = "app.firefit.tv"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.firefit.tv"
        minSdk = 25 // Fire OS 6 (Android 7.1); Fire OS 7 = API 28, Fire OS 8 = API 30
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "FIREFIT_URL", "\"$firefitUrl\"")
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
