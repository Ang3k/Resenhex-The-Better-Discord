/* Resenhex streaming host for Autotalent 0.2. GPL-2.0-or-later.
 * The upstream DSP is unchanged; allocations are zeroed and initial state is
 * snapshotted so a mute can reset all ten layers without allocating in process(). */
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "ladspa.h"
#undef malloc
#undef calloc
#undef free
extern void _init(void);
extern const LADSPA_Descriptor *ladspa_descriptor(unsigned long index);
#define VOICES 10
#define BLOCK 128
#define ALLOCATIONS 96
typedef struct { void *pointer, *initial; size_t bytes; } Allocation;
typedef struct {
  LADSPA_Handle handle;
  float controls[32], input[BLOCK], output[BLOCK], notes[4];
  Allocation allocations[ALLOCATIONS];
  int count, fixed, used;
} Voice;
static Voice voices[VOICES];
static const LADSPA_Descriptor *plugin;
static int recording=-1;
static unsigned long rate=48000;
void *at_allocate(size_t count,size_t size) {
  if(size && count>((size_t)-1)/size) return NULL;
  void *pointer=calloc(count,size);
  if(pointer && recording>=0) {
    Voice *v=&voices[recording];
    if(v->count>=ALLOCATIONS){free(pointer);return NULL;}
    v->allocations[v->count++]=(Allocation){pointer,NULL,count*size};
  }
  return pointer;
}
void at_deallocate(void *pointer) { free(pointer); }
int at_setup(int sample_rate) {
  if(sample_rate<16000 || sample_rate>96000) return 0;
  rate=(unsigned long)sample_rate;
  if(!plugin){_init();plugin=ladspa_descriptor(0);}
  return plugin!=NULL;
}
int at_new(int mode,float shift,float warp,float amplitude,float speed,float smooth,
           float n0,float n1,float n2,float n3) {
  int id;for(id=0;id<VOICES && voices[id].used;id++);if(id==VOICES||!plugin)return -1;
  Voice *v=&voices[id];memset(v,0,sizeof(*v));v->used=1;v->fixed=mode==2;
  v->notes[0]=n0;v->notes[1]=n1;v->notes[2]=n2;v->notes[3]=n3;
  float *c=v->controls;c[0]=440;c[2]=v->fixed?1:0;c[15]=v->fixed?0:1;c[16]=smooth;
  c[17]=shift;c[19]=amplitude;c[20]=speed;c[21]=amplitude>0?1:0;c[24]=1;c[25]=warp;c[26]=1;
  int major[12]={1,-1,1,1,-1,1,-1,1,1,-1,1,-1};
  int pent[12]={1,-1,-1,1,-1,1,-1,1,-1,-1,1,-1};
  for(int n=0;n<12;n++)c[3+n]=v->fixed?1:mode==0?pent[n]:major[n];
  recording=id;v->handle=plugin->instantiate(plugin,rate);recording=-1;
  if(!v->handle){v->used=0;return -1;}
  for(int p=0;p<32;p++)if(p!=29 && p!=30)plugin->connect_port(v->handle,p,&c[p]);
  plugin->connect_port(v->handle,29,v->input);plugin->connect_port(v->handle,30,v->output);
  for(int a=0;a<v->count;a++) {
    Allocation *allocation=&v->allocations[a];allocation->initial=malloc(allocation->bytes);
    if(!allocation->initial)return -1;
    memcpy(allocation->initial,allocation->pointer,allocation->bytes);
  }
  return id;
}
float *at_input_ptr(int id){return id>=0 && id<VOICES?voices[id].input:NULL;}
float *at_output_ptr(int id){return id>=0 && id<VOICES?voices[id].output:NULL;}
int at_run(int id,int frames,double clock_frame) {
  if(id<0||id>=VOICES||!voices[id].used||frames<1||frames>BLOCK)return 0;
  Voice *v=&voices[id];
  if(v->fixed) {
    double seconds=fmax(0,(clock_frame-((rate>=88200)?4095:2047))/rate);
    int step=(int)floor(seconds/1.5),previous=step>0?step-1:0;
    double phase=seconds-step*1.5,alpha=fmin(1,phase/.09);alpha=alpha*alpha*(3-2*alpha);
    v->controls[1]=(float)((1-alpha)*v->notes[previous%4]+alpha*v->notes[step%4]-69);
  }
  plugin->run(v->handle,(unsigned long)frames);return 1;
}
int at_latency(int id){return id>=0 && id<VOICES?(int)voices[id].controls[31]:0;}
void at_reset(int id) {
  if(id<0||id>=VOICES||!voices[id].used)return;Voice *v=&voices[id];
  for(int a=0;a<v->count;a++)memcpy(v->allocations[a].pointer,v->allocations[a].initial,v->allocations[a].bytes);
  memset(v->input,0,sizeof(v->input));memset(v->output,0,sizeof(v->output));
  v->controls[27]=0;v->controls[28]=0;v->controls[31]=0;
}
void at_release(int id) {
  if(id<0||id>=VOICES||!voices[id].used)return;Voice *v=&voices[id];
  plugin->cleanup(v->handle);for(int a=0;a<v->count;a++)free(v->allocations[a].initial);
  memset(v,0,sizeof(*v));
}
