import sys
import json
from pytubefix import YouTube

def resolve(video_id):
    try:
        url = f"https://www.youtube.com/watch?v={video_id}"
        yt = YouTube(url, use_po_token=False)

        # Prefer MP4/AAC streams (itag 140 = 128kbps, 139 = 48kbps) because
        # WebM/Opus streams often have incorrect duration metadata in the browser.
        stream = (
            yt.streams.get_by_itag(140)  # audio/mp4 128kbps — most reliable
            or yt.streams.get_by_itag(139)  # audio/mp4 48kbps — fallback
            or yt.streams.filter(only_audio=True, mime_type="audio/mp4").first()
            or yt.streams.get_audio_only()   # last resort (may be WebM)
        )

        if not stream or not stream.url:
            print(json.dumps({"error": "No audio stream found"}))
            sys.exit(1)

        result = {
            "url": stream.url,
            "mimeType": stream.mime_type,
            "itag": stream.itag,
            "title": yt.title,
            "duration": yt.length
        }
        print(json.dumps(result))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing video ID"}))
        sys.exit(1)
    resolve(sys.argv[1])
