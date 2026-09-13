import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';
import WaveformRecord from '@/components/timeline/inputs/WaveformRecord.vue';

const createRecorderStub = () => {
  const handlers = {};
  return {
    handlers,
    on: (event, cb) => {
      handlers[event] = cb;
    },
    getDuration: () => 2500,
    startRecording: () => Promise.resolve(),
    stopRecording: () => {},
  };
};

describe('音声の録音', () => {
  let originalCreate;
  let originalRecordCreate;
  let originalMediaRecorder;
  let originalWindowMediaRecorder;
  let recorder;
  let stopCalled;

  beforeEach(() => {
    recorder = createRecorderStub();
    stopCalled = 0;
    recorder.stopRecording = () => {
      stopCalled += 1;
    };
    originalCreate = WaveSurfer.create;
    originalRecordCreate = RecordPlugin.create;
    originalMediaRecorder = global.MediaRecorder;
    originalWindowMediaRecorder = typeof window !== 'undefined' ? window.MediaRecorder : undefined;
    const mediaRecorderMock = { isTypeSupported: () => true };
    global.MediaRecorder = mediaRecorderMock;
    if (typeof window !== 'undefined') {
      window.MediaRecorder = mediaRecorderMock;
    }

    WaveSurfer.create = () => ({
      registerPlugin: () => recorder,
      destroy: () => {},
    });
    RecordPlugin.create = () => recorder;
  });

  afterEach(() => {
    WaveSurfer.create = originalCreate;
    RecordPlugin.create = originalRecordCreate;
    if (typeof originalMediaRecorder === 'undefined') {
      delete global.MediaRecorder;
    } else {
      global.MediaRecorder = originalMediaRecorder;
    }
    if (typeof window !== 'undefined') {
      if (typeof originalWindowMediaRecorder === 'undefined') {
        delete window.MediaRecorder;
      } else {
        window.MediaRecorder = originalWindowMediaRecorder;
      }
    }
  });

  it('録音開始と停止でレコーダーを操作する', async () => {
    const wrapper = shallowMount(WaveformRecord);

    await wrapper.vm.start();
    await wrapper.vm.stop();

    expect(stopCalled).to.equal(1);
    wrapper.unmount();
  });

  it('録音終了でblobReadyを通知する', async () => {
    const wrapper = shallowMount(WaveformRecord);

    recorder.handlers['record-end']({ size: 1 });
    await wrapper.vm.$nextTick();

    const payload = wrapper.emitted().blobReady[0][0];
    expect(payload.duration).to.equal(2.5);
    wrapper.unmount();
  });

  it('デバイス準備とエラーを通知する', async () => {
    const wrapper = shallowMount(WaveformRecord);

    recorder.handlers.deviceReady();
    recorder.handlers.deviceError('error');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted().deviceReady).to.have.lengthOf(1);
    expect(wrapper.emitted().deviceError[0][0]).to.equal('error');
    wrapper.unmount();
  });
});
