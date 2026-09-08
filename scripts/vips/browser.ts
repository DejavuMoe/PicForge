import '../performance/browser';
import { VipsProbe, getVipsCapabilities } from '../../packages/worker/src/vips/vipsProbe';
Object.assign(window, { VipsProbe, getVipsCapabilities });
