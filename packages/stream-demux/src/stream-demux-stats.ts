import { ConsumerStats } from "@socket-mesh/writable-consumable-stream";

export interface StreamDemuxStats extends ConsumerStats {
	stream: string
}