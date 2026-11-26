const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');

const html = readFileSync(process.env.PVM_TEST_HTML || path.resolve(__dirname, '../src/index.template.html'), 'utf8');
const source = html.slice(html.indexOf('      async function encodeFastAudio('), html.indexOf('      function fastSubtitleSpans('));

async function encodeNarration(narrationFrames, {queued = false} = {}) {
  const submitted = [];
  const flushes = [];
  const sampleRate = 48000;
  const slide = {prePadding: 600 / sampleRate, postPadding: 22 / sampleRate};
  const report = {details: {}};
  let activeEncoder;
  let waits = 0;
  // Observe the PCM at the WebCodecs boundary. Encoder-specific padding
  // must not be allowed to enter the timeline between these blocks.
  class AudioEncoder {
    constructor({output}) {
      this.output = output;
      this.encodeQueueSize = 0;
      activeEncoder = this;
    }
    configure() {}
    encode(data) {
      submitted.push(data);
      if (queued) this.encodeQueueSize++;
      this.output({data: new Uint8Array(1), decoderConfig: {description: new Uint8Array(2)}});
    }
    async flush() {
      flushes.push(submitted.length);
      this.encodeQueueSize = 0;
    }
    close() {}
  }
  class AudioData {
    constructor(data) { Object.assign(this, data, {data: Float32Array.from(data.data)}); }
    close() {}
  }
  const encode = vm.runInNewContext('(' + source + ')', {
    state: {slides: [slide]}, $: () => null, AudioEncoder, AudioData,
    assertExportActive() {}, setVideoProgress() {}, performanceStageStart() {},
    performanceStageEnd() {},
    waitEncoderBackpressure: async (encoder, limit) => {
      if (encoder.encodeQueueSize > limit) await encoder.flush();
    },
    exportWait: async () => {
      waits++;
      activeEncoder.encodeQueueSize = 0;
    },
    captureEncodedPacket: packet => packet, sceneHasExportAudio: () => true,
    decodeSceneAudio: async () => ({}), narrationTrim: () => ({duration: narrationFrames / sampleRate, offset: 0}),
    sampleAudioBuffer: (buffer, channel) => channel === 0 ? 0.5 : -0.25
  });
  await encode([0], {sampleRate, channels: 2, audioConfig: {}}, {}, null, report);
  return {submitted, flushes, report, waits};
}

test('AAC receives continuous, complete blocks across padding and narration', async () => {
  const {submitted, report} = await encodeNarration(1300);
  assert.deepEqual(submitted.map(audio => audio.numberOfFrames), [1024, 1024]);
  assert.deepEqual(submitted.map(audio => audio.timestamp), [0, 21333]);
  assert.equal(report.details.audioFrames, 1922);
  for (const [channel, amplitude] of [0.5, -0.25].entries()) {
    const timeline = submitted.flatMap(({data}) => Array.from(data.slice(channel * 1024, (channel + 1) * 1024)));
    assert.deepEqual(timeline, Array.from({length: 2048}, (_, i) => i >= 600 && i < 1900 ? amplitude : 0));
  }
});

test('a full AAC queue drains without flushing before the end of the soundtrack', async () => {
  const {submitted, flushes, waits} = await encodeNarration(28000, {queued: true});
  assert.equal(submitted.length, 28);
  assert.deepEqual(flushes, [28]);
  assert.ok(waits > 0);
});
