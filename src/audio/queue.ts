import type { Track, RepeatMode } from "@/types/music";

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class QueueManager {
  private queue: Track[] = [];
  private shuffledQueue: Track[] = [];
  private currentIndex: number = 0;
  private shuffle: boolean = false;
  private repeatMode: RepeatMode = "off";
  private autoplay: boolean = true;
  private priorityQueueCount: number = 0;

  constructor(initialTracks: Track[] = [], startIndex: number = 0) {
    this.queue = initialTracks;
    this.currentIndex = startIndex >= 0 && startIndex < initialTracks.length ? startIndex : 0;
  }

  public getTracks(): Track[] {
    return this.shuffle ? this.shuffledQueue : this.queue;
  }

  public getRawQueue(): Track[] {
    return this.queue;
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public getRepeatMode(): RepeatMode {
    return this.repeatMode;
  }

  public isShuffle(): boolean {
    return this.shuffle;
  }

  public isAutoplay(): boolean {
    return this.autoplay;
  }

  public getPriorityQueueCount(): number {
    return this.priorityQueueCount;
  }

  public getCurrentTrack(): Track | null {
    const active = this.getTracks();
    if (this.currentIndex >= 0 && this.currentIndex < active.length) {
      return active[this.currentIndex];
    }
    return null;
  }

  public getNextTrack(): Track | null {
    if (this.repeatMode === "track") {
      return this.getCurrentTrack();
    }

    const active = this.getTracks();
    const nextIndex = this.currentIndex + 1;

    if (nextIndex < active.length) {
      return active[nextIndex];
    }

    if (this.repeatMode === "queue" && active.length > 0) {
      return active[0];
    }

    return null;
  }

  public getPreviousTrack(): Track | null {
    const active = this.getTracks();
    const prevIndex = this.currentIndex - 1;

    if (prevIndex >= 0 && prevIndex < active.length) {
      return active[prevIndex];
    }

    if (this.repeatMode === "queue" && active.length > 0) {
      return active[active.length - 1];
    }

    return null;
  }

  public advance(): Track | null {
    if (this.repeatMode === "track") {
      return this.getCurrentTrack();
    }

    const active = this.getTracks();
    const nextIndex = this.currentIndex + 1;

    if (nextIndex < active.length) {
      this.currentIndex = nextIndex;
      if (this.priorityQueueCount > 0) {
        this.priorityQueueCount--;
      }
      return active[this.currentIndex];
    }

    if (this.repeatMode === "queue" && active.length > 0) {
      this.currentIndex = 0;
      return active[0];
    }

    return null;
  }

  public retreat(): Track | null {
    const active = this.getTracks();
    const prevIndex = Math.max(0, this.currentIndex - 1);
    this.currentIndex = prevIndex;
    return active[prevIndex] || null;
  }

  public setQueue(tracks: Track[], startIndex: number = 0) {
    this.queue = tracks;
    if (this.shuffle) {
      this.shuffledQueue = shuffleArray(tracks);
      const startTrack = tracks[startIndex];
      if (startTrack) {
        const found = this.shuffledQueue.findIndex((t) => t.id === startTrack.id);
        this.currentIndex = found !== -1 ? found : 0;
      } else {
        this.currentIndex = 0;
      }
    } else {
      this.currentIndex = startIndex >= 0 && startIndex < tracks.length ? startIndex : 0;
    }
    this.priorityQueueCount = 0;
  }

  public addToQueue(track: Track) {
    this.queue.push(track);
    if (this.shuffle) {
      this.shuffledQueue.push(track);
    }
  }

  public playNext(track: Track) {
    if (this.queue.length === 0) {
      this.setQueue([track], 0);
      return;
    }

    const insertIndex = this.currentIndex + 1 + this.priorityQueueCount;
    this.queue.splice(insertIndex, 0, track);
    if (this.shuffle) {
      this.shuffledQueue.splice(insertIndex, 0, track);
    }
    this.priorityQueueCount++;
  }

  public removeFromQueue(index: number) {
    if (index < 0 || index >= this.queue.length) return;

    const wasPriority =
      index > this.currentIndex && index <= this.currentIndex + this.priorityQueueCount;

    this.queue.splice(index, 1);
    if (this.shuffle) {
      this.shuffledQueue = shuffleArray(this.queue);
    }

    if (index < this.currentIndex) {
      this.currentIndex = Math.max(0, this.currentIndex - 1);
    }
    if (wasPriority) {
      this.priorityQueueCount = Math.max(0, this.priorityQueueCount - 1);
    }
  }

  public clearQueue(keepCurrent = true) {
    const current = this.getCurrentTrack();
    if (keepCurrent && current) {
      this.queue = [current];
      this.shuffledQueue = [current];
      this.currentIndex = 0;
    } else {
      this.queue = [];
      this.shuffledQueue = [];
      this.currentIndex = 0;
    }
    this.priorityQueueCount = 0;
  }

  public setShuffle(shuffle: boolean) {
    if (this.shuffle === shuffle) return;
    this.shuffle = shuffle;
    const current = this.getCurrentTrack();

    if (shuffle) {
      this.shuffledQueue = shuffleArray(this.queue);
      if (current) {
        const found = this.shuffledQueue.findIndex((t) => t.id === current.id);
        if (found !== -1) {
          this.shuffledQueue.splice(found, 1);
          this.shuffledQueue.unshift(current);
          this.currentIndex = 0;
        }
      }
    } else {
      if (current) {
        const found = this.queue.findIndex((t) => t.id === current.id);
        this.currentIndex = found !== -1 ? found : 0;
      }
    }
  }

  public setRepeatMode(mode: RepeatMode) {
    this.repeatMode = mode;
  }

  public setAutoplay(autoplay: boolean) {
    this.autoplay = autoplay;
  }

  public appendTracks(tracks: Track[]) {
    if (!tracks || tracks.length === 0) return;
    const existingIds = new Set(this.queue.map((t) => t.id));
    const newTracks = tracks.filter((t) => !existingIds.has(t.id));
    if (newTracks.length === 0) return;

    this.queue.push(...newTracks);
    if (this.shuffle) {
      this.shuffledQueue.push(...newTracks);
    }
  }

  public setCurrentIndex(index: number) {
    const active = this.getTracks();
    if (index >= 0 && index < active.length) {
      this.currentIndex = index;
    }
  }
}
