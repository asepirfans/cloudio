import sys
import json
from pytubefix import YouTube

def resolve(video_id):
    url = f"https://www.youtube.com/watch?v={video_id}"
    last_err = None

    for client_name in ["ANDROID", "IOS", "MWEB"]:
        try:
            yt = YouTube(url, client=client_name)
            stream = (
                yt.streams.get_by_itag(140)
                or yt.streams.get_by_itag(139)
                or yt.streams.filter(only_audio=True, mime_type="audio/mp4").first()
                or yt.streams.get_audio_only()
            )

            if stream and stream.url:
                result = {
                    "url": stream.url,
                    "mimeType": stream.mime_type or "audio/mp4",
                    "itag": stream.itag,
                    "title": yt.title,
                    "duration": yt.length
                }
                print(json.dumps(result))
                sys.exit(0)
        except Exception as e:
            last_err = e
            continue

    print(json.dumps({"error": str(last_err or "No audio stream found")}))
    sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing video ID"}))
        sys.exit(1)
    resolve(sys.argv[1])
