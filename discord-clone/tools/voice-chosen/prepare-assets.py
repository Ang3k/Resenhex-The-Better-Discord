"""Build frozen convolution responses and coefficients from the approved recipes.
Requires the archived SoX 14.4.2, NumPy and SciPy; does not contact the network.
"""
from pathlib import Path
import argparse,json,hashlib,subprocess
import numpy as np
from scipy import signal
from scipy.io import wavfile

args=argparse.ArgumentParser()
args.add_argument('--reference-build',type=Path,required=True)
args.add_argument('--round2-build',type=Path,required=True)
args=args.parse_args()
APP=Path(__file__).resolve().parents[2]
OUT=APP/'public/voice-fx-assets';OUT.mkdir(exist_ok=True)
RATE=48000
SOX=args.reference_build/'components/sox/sox-14.4.2/sox.exe'
manifest={'rate':RATE,'assets':[]}

def save(name,audio,recipe):
    file=OUT/(name+'.wav');wavfile.write(file,RATE,audio.astype(np.float32))
    manifest['assets'].append({'file':file.name,'recipe':recipe,'frames':len(audio),
      'channels':1 if audio.ndim==1 else audio.shape[1],
      'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})

# A static SoX reverb/echo chain is linear. Its exact finite impulse response
# preserves the published delays, gains and comb/allpass topology in a native
# ConvolverNode, without substituting an unrelated random-room generator.
pulse=np.zeros(RATE*10,dtype=np.float32);pulse[0]=.01
input_file=OUT/'build-impulse.wav';wavfile.write(input_file,RATE,pulse)
for name,recipe in {
  'caverna':['reverb','80','echo','0.6','0.6','120','0.3'],
  'alien':['echo','0.8','0.6','80','0.5','reverb','40'],
  'fantasma':['echo','0.9','0.7','200','0.6','reverb','60','vol','0.7'],
}.items():
    temporary=OUT/(name+'-build.wav')
    subprocess.run([str(SOX),'-R',str(input_file),'-b','32','-e','floating-point',str(temporary),*recipe],check=True)
    rate,ir=wavfile.read(temporary);assert rate==RATE
    # Keep all ten seconds; do not infer a shorter room from an arbitrary cutoff.
    save(name,ir.astype(np.float64)/.01,{'sox':'14.4.2','arguments':recipe,'impulseAmplitude':.01,'seconds':10,'normalization':'none'})
    temporary.unlink()
input_file.unlink()

rate,ir=wavfile.read(args.reference_build/'components/bathroom-stereo.wav')
assert ir.dtype==np.int16 or ir.dtype==np.int32 or ir.dtype==np.float32
if np.issubdtype(ir.dtype,np.integer):ir=ir.astype(np.float64)/(2**(np.iinfo(ir.dtype).bits-1))
if rate!=RATE:ir=signal.resample_poly(ir,RATE,rate,axis=0)
ir=ir/np.sqrt(np.mean(np.sum(ir**2,axis=0)))
save('banheiro',ir,{'source':'The Impulse Factory / Tiled Bathroom Stereo','normalization':'mean-channel L2 energy','dry':.65,'wet':.55,'preDelayMs':8})

def hall(seconds,pre_ms,damp,seed):
    rng=np.random.default_rng(seed);n=int(seconds*RATE);t=np.arange(n)/RATE
    ir=np.zeros((n,2))
    for c in range(2):
        noise=rng.standard_normal(n)
        bright=noise*np.exp(-6.9*t/(seconds*.45))
        dark=signal.sosfilt(signal.butter(2,damp,fs=RATE,output='sos'),noise)*np.exp(-6.9*t/seconds)
        ir[:,c]=bright*.35+dark
    ir[:int(.012*RATE)]*=np.linspace(0,1,int(.012*RATE))[:,None]
    ir=np.concatenate([np.zeros((int(pre_ms*RATE/1000),2)),ir])
    return ir/np.sqrt(np.mean(np.sum(ir**2,axis=0)))

for name,seconds,pre_ms,damp,seed in [('acordes',2.4,28,3200,7),('coral',3.2,35,2600,11)]:
    save(name,hall(seconds,pre_ms,damp,seed),{'seconds':seconds,'preDelayMs':pre_ms,'dampHz':damp,'seed':seed,'source':'approved round 3 hall()'})

bank=[]
for band in range(40):
    center=100*100**(band/40);next_center=100*100**((band+1)/40);width=.5*(next_center-center)
    bank.append(signal.butter(3,[center-width/2,center+width/2],btype='bandpass',fs=RATE,output='sos').tolist())
coefficients={'rate':RATE,'robotBands':bank,'robotEnvelope':signal.butter(1,50,fs=RATE,output='sos').tolist(),
    'robotHighpass':signal.butter(1,250,btype='highpass',fs=RATE,output='sos').tolist(),
    'drunkLowpass':signal.butter(2,2600,fs=RATE,output='sos').tolist(),
    'musicHighpass':signal.butter(2,150,btype='highpass',fs=RATE,output='sos').tolist(),
    'leadHighpass':signal.butter(2,90,btype='highpass',fs=RATE,output='sos').tolist(),
    'choirLowpass':signal.butter(2,7000,fs=RATE,output='sos').tolist(),
    'levelHighpass':signal.butter(2,100,btype='highpass',fs=RATE,output='sos').tolist()}

# Freeze the approved whole-clip room scaling and lead/stem ratios as the
# starting levels. Live correction may adjust slowly for a different microphone.
dry=np.fromfile(args.reference_build/'input.f32',dtype='<f4').astype(np.float64)
def weighted_active(x):
    mono=x if x.ndim==1 else x.mean(1)
    weighted=signal.sosfilt(np.array(coefficients['levelHighpass']),mono)
    size=RATE//50;n=len(mono)//size
    raw=(mono[:n*size].reshape(n,size)**2).mean(1)
    energy=(weighted[:n*size].reshape(n,size)**2).mean(1)
    return energy[raw>10**(-45/10)].mean()
def peaking(hz,db,q):
    a=10**(db/40);w=2*np.pi*hz/RATE;alpha=np.sin(w)/(2*q)
    return signal.tf2sos([1+alpha*a,-2*np.cos(w),1-alpha*a],[1+alpha/a,-2*np.cos(w),1-alpha/a])
def layer(notes,shift,warp,amp,hz,smooth,chord,glide):
    tag='_'.join(map(str,[notes,shift,warp,amp,hz,smooth,chord,glide])).replace(',','-')
    file=args.round2_build/'stems3'/(tag+'.f32')
    return np.fromfile(file,dtype='<f4')[2047:2047+len(dry)].astype(np.float64)
levels={'effects':{}}
for name in ['acordes','coral']:
    mix=np.zeros((len(dry)+RATE*(3 if name=='acordes' else 4),2))
    if name=='acordes':
        voices=[([48,43,45,41],0,.40,0,.04,4.6,-.12),([55,55,57,57],-.55,.38,7,.07,5.2,0),([60,59,60,60],.55,.38,12,.07,5.6,0),([64,62,64,65],-.25,.40,16,.08,5.0,.08),([67,67,69,69],.30,.34,21,.08,5.9,.12)]
        for notes,pan,gain,delay,amp,hz,warp in voices:
            seq=','.join(map(str,notes));stem=(layer(seq,0,warp,amp,hz,.01,1.5,.09)+layer(seq,0,warp,amp,hz*1.13,.01,1.5,.09))*.62
            d=round(delay*RATE/1000);mix[d:d+len(stem)]+=stem[:,None]*np.array([np.cos((pan+1)*np.pi/4),np.sin((pan+1)*np.pi/4)])*gain
        ir=hall(2.4,28,3200,7);wet=.42;lead_db=.75
    else:
        sections=[(-7,-.30,.34,[(-.2,24,4.7),(.25,41,5.1)]),(0,-.05,.30,[(-.45,0,5.4),(.4,29,4.9)]),(2,.15,.26,[(-.7,13,5.6),(.15,37,5.0),(.6,52,5.9)]),(4,.30,.24,[(.7,9,6.0),(-.15,33,5.5),(.35,58,6.3)])]
        for shift,warp,gain,singers in sections:
            for pan,delay,hz in singers:
                stem=layer('scale',shift,warp,.09,hz,.18,1,1);d=round(delay*RATE/1000)
                mix[d:d+len(stem)]+=stem[:,None]*np.array([np.cos((pan+1)*np.pi/4),np.sin((pan+1)*np.pi/4)])*gain
        mix=signal.sosfilt(np.array(coefficients['choirLowpass']),mix,axis=0)
        ir=hall(3.2,35,2600,11);wet=.55;lead_db=.25
    padded=np.concatenate([mix,np.zeros((len(ir),2))])
    mono=signal.sosfilt(np.array(coefficients['musicHighpass']),padded.mean(1))
    reverbed=np.stack([signal.fftconvolve(mono,ir[:,c])[:len(padded)] for c in range(2)],1)
    room_scale=np.sqrt((mix**2).mean())/np.sqrt((reverbed**2).mean())
    ensemble=padded*(1-wet*.5)+reverbed*room_scale*wet
    carved=signal.sosfilt(peaking(2500,-4,.7),ensemble,axis=0)
    lead=signal.sosfilt(np.array(coefficients['leadHighpass']),dry)
    lead=signal.sosfilt(peaking(3000,3.5,.9),lead);lead=signal.sosfilt(peaking(250,-2,1),lead)
    reflections=np.zeros_like(lead)
    for ms,gain in [(19,.1),(31,.07),(47,.05),(71,.03)]:
        d=round(ms*RATE/1000);reflections[d:]+=lead[:-d]*gain
    lead_stereo=np.zeros_like(ensemble);lead_stereo[:len(lead),0]=lead+reflections*.9;lead_stereo[:len(lead),1]=lead+np.roll(reflections,37)*.9
    stem_gain=np.sqrt(weighted_active(lead_stereo)/weighted_active(carved))*10**(-lead_db/20)
    combined=lead_stereo+carved*stem_gain
    levels['effects'][name]={'roomWetGain':wet*room_scale,'dryGain':1-wet*.5,'musicGain':stem_gain,'gain':float(np.sqrt(weighted_active(dry)/weighted_active(combined))),'leadDb':lead_db}
(OUT/'levels.json').write_text(json.dumps(levels,indent=2),encoding='utf-8')
(OUT/'coefficients.json').write_text(json.dumps(coefficients,separators=(',',':')),encoding='utf-8')
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({'assets':len(manifest['assets']),'bytes':sum(f.stat().st_size for f in OUT.glob('*.wav'))}))
