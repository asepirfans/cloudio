import { Innertube, Platform, UniversalCache } from "youtubei.js";

// Configure custom JavaScript evaluator to allow Innertube to decipher streaming URLs
if (typeof Platform !== "undefined" && Platform.shim) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Platform.shim.eval = async (data: { output: string }, env: Record<string, any> = {}) => {
    return new Function(...Object.keys(env), data.output)(...Object.values(env));
  };
}

let ytClient: Innertube | null = null;
let initPromise: Promise<Innertube> | null = null;

export async function getYtClient(): Promise<Innertube> {
  if (ytClient) return ytClient;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (typeof Platform !== "undefined" && Platform.shim && !Platform.shim.eval) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Platform.shim.eval = async (data: { output: string }, env: Record<string, any> = {}) => {
        return new Function(...Object.keys(env), data.output)(...Object.values(env));
      };
    }

    const yt = await Innertube.create({
      timezone: "Asia/Jakarta",
      cache: new UniversalCache(false),
    });

    ytClient = yt;
    return yt;
  })();

  return initPromise;
}
