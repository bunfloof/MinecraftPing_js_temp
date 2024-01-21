const net = require('net');

class MinecraftPing {
    constructor(address, port = 25565, timeout = 2000) {
        this.address = address;
        this.port = port;
        this.timeout = timeout;
        this.socket = new net.Socket();
        this.startTime = 0;
    }

    async ping() {
        return new Promise((resolve, reject) => {
            this.socket.once('error', reject);

            this.socket.connect(this.port, this.address, () => {
                this.startTime = Date.now();
                this.sendPacket().then(() => {
                    this.readResponse().then(resolve).catch(reject);
                }).catch(reject);
            });
        });
    }

    async sendPacket() {
        const packet = Buffer.concat([
            this.writeVarInt(0),
            this.writeVarInt(-1),
            this.writeString(this.address),
            Buffer.from([this.port >> 8, this.port & 0xFF]),
            this.writeVarInt(1)
        ]);

        const length = this.writeVarInt(packet.length);
        const finalPacket = Buffer.concat([length, packet, Buffer.from([0x01, 0x00])]);

        this.socket.write(finalPacket);
    }

    async readResponse() {
        return new Promise((resolve, reject) => {
            let dataBuffer = Buffer.alloc(0);
            this.socket.on('data', (data) => {
                dataBuffer = Buffer.concat([dataBuffer, data]);

                const rawResponse = dataBuffer.toString();
                let depth = 0;
                let jsonStart = -1;
                let jsonEnd = -1;

                for (let i = 0; i < rawResponse.length; i++) {
                    if (rawResponse[i] === '{') {
                        depth++;
                        if (depth === 1) {
                            jsonStart = i;
                        }
                    } else if (rawResponse[i] === '}') {
                        depth--;
                        if (depth === 0) {
                            jsonEnd = i + 1;
                            break;
                        }
                    }
                }

                if (jsonStart !== -1 && jsonEnd !== -1) {
                    const jsonPart = rawResponse.substring(jsonStart, jsonEnd);

                    try {
                        const jsonResponse = JSON.parse(jsonPart);
                        const latency = Date.now() - this.startTime;
                        jsonResponse.latency = latency;
                        this.socket.destroy();
                        resolve(jsonResponse);
                    } catch (e) {
                        reject(e);
                    }
                }
            });

            this.socket.setTimeout(this.timeout, () => {
                this.socket.destroy();
                reject(new Error('Request timed out'));
            });
        });
    }
	
    writeVarInt(value) {
        let buf = Buffer.alloc(5);
        let offset = 0;
        do {
            let byte = value & 0x7F;
            value >>>= 7;
            if (value != 0) {
                byte |= 0x80;
            }
            buf.writeUInt8(byte, offset++);
        } while (value != 0);
        return buf.slice(0, offset);
    }

    writeString(value) {
        let buf = Buffer.alloc(value.length);
        buf.write(value);
        return Buffer.concat([this.writeVarInt(value.length), buf]);
    }
}

// Example usage
const server = new MinecraftPing('31.214.135.11', 25702);
server.ping().then(console.log).catch(console.error);
