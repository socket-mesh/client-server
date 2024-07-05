import { StreamDemuxStats } from "@socket-mesh/stream-demux";
import { StreamDemuxWrapper } from "@socket-mesh/stream-demux";

export class ChannelOutput {
	private readonly _name: string;
	private readonly _output: StreamDemuxWrapper<unknown>;

	constructor(name: string, output: StreamDemuxWrapper<unknown>) {
		this._name = name;
		this._output = output;
	}

	hasConsumer(consumerId: number): boolean {
		return this._output.hasConsumer(this._name, consumerId);
	}

	getBackpressure(consumerId?: number): number {
		if (typeof consumerId === 'number') {
			if (this.hasConsumer(consumerId)) {
				return this._output.getBackpressure(consumerId);
			}

			return 0;
		}

		return this._output.getBackpressure(this._name);
	}

	getConsumerStats(consumerId?: number): StreamDemuxStats | undefined;
	getConsumerStats(consumerId?: number): StreamDemuxStats | StreamDemuxStats[] | undefined {
		if (typeof consumerId === 'number') {
			if (this.hasConsumer(consumerId)) {
				return this._output.getConsumerStats(consumerId);
			}
			return undefined;
		}

		return this._output.getConsumerStats(this._name);
	}

	close(): void {
		this._output.close(this._name);
	}

	kill(consumerId?: number): void;
	kill(consumerId?: number): void {
		if (typeof consumerId === 'number') {
			if (this.hasConsumer(consumerId)) {
				this._output.kill(consumerId);
			}

			return;
		}

		this._output.kill(this._name);
	}
}