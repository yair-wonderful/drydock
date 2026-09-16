import type { PackageFile } from "./types";

/**
 * Publishes a package into Blackbird's preview service worker.
 *
 * Uses the SW's own documented message protocol verbatim
 * (`public/preview-sw.js`): `UPLOAD_BUNDLE { uuid, files: [{ path, blob,
 * mime }] }`, answered over a MessageChannel port, serving each file at
 * `/preview/<uuid>/<path>`. Nothing here is a new mechanism — the same door
 * the folder-drop flow already uses, opened programmatically.
 */

interface UploadReply {
	type: "UPLOAD_DONE" | "UPLOAD_ERROR";
	uuid: string;
	message?: string;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
	if (!("serviceWorker" in navigator)) {
		throw new Error("This browser has no service worker support.");
	}
	await navigator.serviceWorker.register("/preview-sw.js", { scope: "/" });
	const registration = await navigator.serviceWorker.ready;
	if (!registration.active) {
		throw new Error("Preview service worker registered but not active.");
	}
	return registration;
}

/** Resolves to the package's entry URL, ready to hand to a canvas frame. */
export default async function publishPackage(
	uuid: string,
	files: PackageFile[],
): Promise<string> {
	const registration = await getRegistration();
	const worker = registration.active;
	if (!worker) {
		throw new Error("Preview service worker is not active.");
	}

	const payload = files.map((file) => ({
		path: file.path,
		blob: new Blob([file.contents], { type: file.mime }),
		mime: file.mime,
	}));

	await new Promise<void>((resolve, reject) => {
		const channel = new MessageChannel();
		channel.port1.onmessage = (event: MessageEvent<UploadReply>) => {
			if (event.data?.type === "UPLOAD_DONE") {
				resolve();
			} else {
				reject(new Error(event.data?.message ?? "Package upload failed."));
			}
		};
		worker.postMessage({ type: "UPLOAD_BUNDLE", uuid, files: payload }, [channel.port2]);
	});

	return `/preview/${uuid}/index.html`;
}
