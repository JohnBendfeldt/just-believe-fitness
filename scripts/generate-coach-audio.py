#!/usr/bin/env python3
"""
Studio Coach MP3 Generator for Just Believe Fitness (jbfit.studio)
Modeled on basic-language-school/scripts/generate-all-audio.py using Microsoft Edge Neural TTS.

Generates pre-rendered, browser-proof MP3 coaching prompts into public/audio/coach/
with peppy indoor-cycling instructor energy (en-US-JennyNeural, +8% rate, +3Hz pitch, +20% volume).

Usage:
  python3 scripts/generate-coach-audio.py
  python3 scripts/generate-coach-audio.py --force
  python3 scripts/generate-coach-audio.py --voice en-US-AriaNeural --force
"""

import sys
import json
import asyncio
from datetime import datetime, timezone
from pathlib import Path

try:
    import edge_tts
except ImportError:
    print("Error: edge-tts is not installed. Run: pip3 install edge-tts")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_ROOT / "public" / "audio" / "coach"
MANIFEST_FILE = OUTPUT_DIR / "manifest.json"

DEFAULT_VOICE = "en-US-JennyNeural"
DEFAULT_RATE = "+8%"
DEFAULT_PITCH = "+3Hz"
DEFAULT_VOLUME = "+20%"

# Pre-baked studio coaching clips:
# Every guided workout segment ID + universal ride milestones + generic cue fallbacks.
COACH_CLIPS = {
    # Universal events & fallbacks
    "free-ride-start": "Let's ride! Smooth pedal strokes, find your rhythm, and let's stack those Burn Points!",
    "ten-seconds": "Ten seconds! Get ready to switch!",
    "burn-first": "First Burn Point on the board! Keep that fire going!",
    "burn-twelve": "Twelve Burn Points! Target crushed! Keep pushing!",
    "workout-complete": "Workout complete! Amazing effort today! Spin your legs out easy and grab some water.",
    "cue-warmup": "Warm-up spin! Smooth, easy pedal strokes as we wake up the legs.",
    "cue-base": "Base pace! Lock into a steady, strong Green zone rhythm.",
    "cue-push": "Push pace! Add resistance and drive right into the Orange zone!",
    "cue-all-out": "All out! Empty the tank, fast legs, let's go!",
    "cue-recovery": "Active recovery! Dial the gear down, deep breaths, flush out the legs.",

    # 1. 23-Min Signature Burn (jbf-23-burn)
    "seg-w1": "Welcome to your twenty-three minute Signature Burn! Smooth warm-up spin, bring that heart rate into Blue and early Green!",
    "seg-b1": "Base pace settle! Challenging but doable, lock into a solid Green zone!",
    "seg-p1": "Two-minute Push pace! Add two to three clicks of resistance and drive into Orange!",
    "seg-b2": "Back to Base! Hold steady Green power while controlling your breathing.",
    "seg-p2": "Ninety-second threshold Push! Right around your F T P, let's build those Orange Burn minutes!",
    "seg-ao1": "Thirty seconds All-Out surge! Empty the tank, fast legs, straight into the Burn Zone!",
    "seg-r1": "Nice work! Active recovery. Dial the resistance down, deep breaths, flush the legs.",
    "seg-p3": "Three-minute heavy Push climb! Add heavy gear and drive muscular torque, seated or standing!",
    "seg-b3": "Base flat road! Take off that climb gear and spin briskly in Green.",
    "seg-p4": "Sixty-second final Push! Set up the finisher, hold high Orange!",
    "seg-ao2": "Forty-five second finisher All-Out! Everything left in the legs, finish strong!",
    "seg-cd1": "Awesome push! Cool-down flush. Easy spin and let that heart rate float down.",

    # 2. 20-Min Burn Express (burn-hiit-20)
    "seg-h-wu": "Let's go! Twenty-minute Burn Express! Progressive warm-up, add a click of gear each minute to wake up the legs!",
    "seg-h-push-1": "Round one of five, Push! Sixty seconds right at threshold, let's light it up!",
    "seg-h-ao-1": "Round one, All-Out! Thirty seconds max snap, go, go, go!",
    "seg-h-rec-1": "Round one done! Sixty seconds easy spin, catch your breath.",
    "seg-h-push-2": "Round two, Push! Back on the gas, drive into Orange!",
    "seg-h-ao-2": "Round two, All-Out! Thirty seconds fast legs, attack it!",
    "seg-h-rec-2": "Nice job! Dial it down, smooth recovery spin.",
    "seg-h-push-3": "Round three, halfway there! Strong threshold Push, hold that power!",
    "seg-h-ao-3": "Round three, All-Out! Thirty seconds, push the pace!",
    "seg-h-rec-3": "Awesome! Easy gear, deep breaths, two rounds left.",
    "seg-h-push-4": "Round four, Push! Dig in right here, stack those Burn Points!",
    "seg-h-ao-4": "Round four, All-Out! Thirty seconds explosive power!",
    "seg-h-rec-4": "One final round ahead! Spin light and reset.",
    "seg-h-push-5": "Final round, five of five! Strong sixty-second Push, set up the finish!",
    "seg-h-ao-5": "Last All-Out of the day! Thirty seconds, empty the tank all the way to the line!",
    "seg-h-rec-5": "You crushed all five rounds! Easy recovery spin, catch your breath.",
    "seg-h-cd": "Smooth cool-down spin! Let your breathing settle, great work today!",

    # 3. 30-Min Power Pyramid (ex3-power-pyramid-30)
    "seg-p-wu": "Welcome to the thirty-minute Power Pyramid! Four-minute prep spin, settle into a smooth cadence.",
    "seg-p-s1": "Step one, Sweet Spot Base! Controlled Green aerobic power, nice and steady.",
    "seg-p-s2": "Step two, Threshold Climb! Add heavy resistance and hold strong threshold torque!",
    "seg-p-peak": "Pyramid Summit! Two minutes strong right over F T P, crest this climb!",
    "seg-p-valley": "You made the summit! Valley recovery spin, grab a sip of water and spin light.",
    "seg-p-d2": "Step down the pyramid, Fast Threshold! Same Push watts, quicker leg speed!",
    "seg-p-d1": "Tempo cruise! Settle into a strong, steady Green rhythm.",
    "seg-p-fin": "Sixty-second sprint kick! Final surge to the line, give it everything you've got!",
    "seg-p-cd": "Phenomenal climb! Cool-down spin, dial the resistance way down.",

    # 4. 45-Min YouTube Zone 2/3 Cruise (youtube-zone2-45)
    "seg-e-wu": "Forty-five minute Zone two and three cruise! Easy five-minute warm-up into the Blue zone.",
    "seg-e-b1": "Aerobic Base block one! Lock in a smooth Green endurance rhythm and enjoy your show!",
    "seg-e-p1": "Mid-ride tempo opener! Five-minute brisk Push to wake up those legs!",
    "seg-e-b2": "Aerobic Base block two! Smooth conversational Green zone cruise all the way home.",
    "seg-e-cd": "Final cool-down spin! Easy pedals, great endurance session today!",
}


async def synthesize_clip(
    sem: asyncio.Semaphore,
    clip_id: str,
    text: str,
    voice: str,
    out_path: Path,
    force: bool = False,
) -> str:
    async with sem:
        if out_path.exists() and not force:
            return "skipped"

        temp_path = out_path.with_suffix(".tmp.mp3")
        last_err = None
        for attempt in range(4):
            try:
                communicate = edge_tts.Communicate(
                    text,
                    voice,
                    rate=DEFAULT_RATE,
                    pitch=DEFAULT_PITCH,
                    volume=DEFAULT_VOLUME,
                )
                await communicate.save(str(temp_path))
                temp_path.replace(out_path)
                return "success"
            except Exception as err:
                last_err = err
                if temp_path.exists():
                    temp_path.unlink()
                await asyncio.sleep(0.6 * (attempt + 1))
        print(f"  ERROR generating {clip_id} ({out_path.name}): {last_err}")
        return "error"


async def main() -> None:
    force = "--force" in sys.argv
    voice = DEFAULT_VOICE
    if "--voice" in sys.argv:
        idx = sys.argv.index("--voice")
        if idx + 1 < len(sys.argv):
            voice = sys.argv[idx + 1]

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(5)

    print("=" * 64)
    print("JUST BELIEVE FITNESS - STUDIO COACH MP3 GENERATOR")
    print(f"Voice: {voice} (rate={DEFAULT_RATE}, pitch={DEFAULT_PITCH}, vol={DEFAULT_VOLUME})")
    print(f"Output: {OUTPUT_DIR.relative_to(PROJECT_ROOT)}/")
    print("=" * 64)

    tasks = []
    for clip_id, text in COACH_CLIPS.items():
        out_path = OUTPUT_DIR / f"{clip_id}.mp3"
        tasks.append((clip_id, text, out_path, synthesize_clip(sem, clip_id, text, voice, out_path, force)))

    success = 0
    skipped = 0
    errors = 0
    manifest_clips = {}

    for clip_id, text, out_path, coro in tasks:
        res = await coro
        if res == "success":
            success += 1
            size_kb = out_path.stat().st_size / 1024 if out_path.exists() else 0
            print(f"  [OK] {out_path.name:<24} ({size_kb:5.1f} KB)  {text[:52]}...")
        elif res == "skipped":
            skipped += 1
        else:
            errors += 1

        manifest_clips[clip_id] = {
            "path": f"/audio/coach/{clip_id}.mp3",
            "text": text,
        }

    manifest = {
        "voice": voice,
        "rate": DEFAULT_RATE,
        "pitch": DEFAULT_PITCH,
        "volume": DEFAULT_VOLUME,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "clips": manifest_clips,
    }
    MANIFEST_FILE.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nDone! New: {success}, Skipped: {skipped}, Errors: {errors}")
    if errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
