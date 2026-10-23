package app.firefit.tv

import android.animation.ValueAnimator
import android.content.Context
import android.media.SoundPool
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer

/**
 * FireFIT's offline audio: background music with Media3 ExoPlayer, UI/workout sound effects with SoundPool.
 * All files are bundled in assets/audio (generated with ElevenLabs at development time; no runtime API calls).
 *
 * Music modes: "home" (ambient loop), "workout" (shuffled playlist), "paused" (workout music ducked), "off".
 * Mode switches fade out, swap the playlist, and fade back in. ExoPlayer handles audio focus.
 * Must be used from the main thread (the JS bridge posts to it).
 */
class AudioEngine(private val ctx: Context) {
    private val prefs = ctx.getSharedPreferences("firefit_audio", Context.MODE_PRIVATE)
    var musicVolume = prefs.getFloat("music", 0.55f)
        private set
    var sfxVolume = prefs.getFloat("sfx", 0.8f)
        private set

    private val files: Set<String> = ctx.assets.list("audio")?.toSet() ?: emptySet()
    private val main = Handler(Looper.getMainLooper())
    private var playlist = ""
    private var mode = "off"
    private var duck = 1f
    private var fade: ValueAnimator? = null

    private val player: ExoPlayer = ExoPlayer.Builder(ctx).build().apply {
        setAudioAttributes(
            AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(),
            /* handleAudioFocus = */ true,
        )
        volume = 0f
    }

    private val sounds: SoundPool = SoundPool.Builder()
        .setMaxStreams(4)
        .setAudioAttributes(
            android.media.AudioAttributes.Builder()
                .setUsage(android.media.AudioAttributes.USAGE_GAME)
                .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(),
        )
        .build()
    private val sfxIds = HashMap<String, Int>()

    /** True when bundled audio exists; the web app falls back to synthesized cues otherwise. */
    val ready: Boolean get() = files.any { it.startsWith("music_") || it.startsWith("sfx_") }

    init {
        for (f in files) if (f.startsWith("sfx_") && f.endsWith(".mp3")) {
            ctx.assets.openFd("audio/$f").use { fd -> sfxIds[f.removePrefix("sfx_").removeSuffix(".mp3")] = sounds.load(fd, 1) }
        }
    }

    fun sfx(name: String) {
        sfxIds[name]?.let { sounds.play(it, sfxVolume, sfxVolume, 1, 0, 1f) }
    }

    fun setMode(next: String) {
        if (next == "paused") {
            duck = 0.3f
            fadeTo(musicVolume * duck, 500)
            return
        }
        duck = 1f
        val wanted = when (next) {
            "home" -> "home"
            "workout" -> "workout"
            else -> ""
        }
        mode = next
        if (wanted == playlist) {
            if (wanted.isNotEmpty()) {
                if (!player.isPlaying) player.play()
                fadeTo(musicVolume, 600)
            }
            return
        }
        // fade out the current music, then swap playlists and fade in
        fadeTo(0f, if (playlist.isEmpty()) 0 else 700) {
            playlist = wanted
            if (wanted.isEmpty()) {
                player.stop()
                return@fadeTo
            }
            val items = files.filter { it.startsWith("music_$wanted") && it.endsWith(".mp3") }.sorted()
            if (items.isEmpty()) return@fadeTo
            player.setMediaItems(items.map { MediaItem.fromUri("asset:///audio/$it") })
            player.repeatMode = if (items.size == 1) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_ALL
            player.shuffleModeEnabled = items.size > 1
            player.prepare()
            player.play()
            fadeTo(musicVolume, 1400)
        }
    }

    fun setVolumes(music: Float, effects: Float) {
        musicVolume = music.coerceIn(0f, 1f)
        sfxVolume = effects.coerceIn(0f, 1f)
        prefs.edit().putFloat("music", musicVolume).putFloat("sfx", sfxVolume).apply()
        if (playlist.isNotEmpty()) fadeTo(musicVolume * duck, 200)
    }

    fun onPause() {
        fade?.cancel()
        player.pause()
    }

    fun onResume() {
        if (playlist.isNotEmpty() && mode != "off") {
            player.play()
            fadeTo(musicVolume * duck, 800)
        }
    }

    fun release() {
        fade?.cancel()
        player.release()
        sounds.release()
    }

    private fun fadeTo(target: Float, ms: Long, then: (() -> Unit)? = null) {
        fade?.cancel()
        if (ms <= 0) {
            player.volume = target
            then?.invoke()
            return
        }
        fade = ValueAnimator.ofFloat(player.volume, target).apply {
            duration = ms
            addUpdateListener { player.volume = it.animatedValue as Float }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                private var cancelled = false
                override fun onAnimationCancel(animation: android.animation.Animator) {
                    cancelled = true
                }
                override fun onAnimationEnd(animation: android.animation.Animator) {
                    if (!cancelled) main.post { then?.invoke() }
                }
            })
            start()
        }
    }
}
