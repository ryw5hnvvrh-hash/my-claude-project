import subprocess,imageio_ffmpeg,os,sys
FF=imageio_ffmpeg.get_ffmpeg_exe()
T='/tmp/claude-0/-home-user-my-claude-project/01f22fbd-aae7-5daa-9e36-ba482ec556cd/scratchpad/t28/cut9'; os.makedirs(T,exist_ok=True)
R='media/raw/2026-10-28/'
def keys(f):
    o=subprocess.run([FF,'-v','error','-i',R+f,'-map','0:v','-c','copy','-f','framecrc','-'],capture_output=True,text=True).stdout
    pk=[l.split(',') for l in o.splitlines() if not l.startswith('#')]
    ks=[(i,int(p[2])/600) for i,p in enumerate(pk) if 'F=' not in p[-1]]
    return ks
SEG=[('IMG_3487.MOV',3.74,11.75),('IMG_3487.MOV',19.61,24.5),('IMG_3487.MOV',30.82,35.4),('IMG_3487.MOV',41.09,45.0),('IMG_3488.MOV',0,2.6)]
K={}
lst=[];alist=[];t=0
def run(a): subprocess.run([FF,'-v','error']+a+['-y'],check=True)
for n,(f,s,e) in enumerate(SEG):
    ks=K.setdefault(f,keys(f))
    j=min(range(len(ks)),key=lambda j:abs(ks[j][1]-s))
    (i0,k),(i1,k1)=ks[j],ks[j+1]
    run(['-ss',str(k+0.05),'-i',R+f,'-map','0:v','-c','copy','-frames:v',str(i1-i0),'-strict','unofficial','-avoid_negative_ts','make_zero',f'{T}/{n}a0.mp4'])
    run(['-i',f'{T}/{n}a0.mp4','-c','copy','-bsf:v','noise=drop=lt(pts\,startpts)','-strict','unofficial',f'{T}/{n}a.mp4'])
    run(['-ss',str(k1+0.05),'-i',R+f,'-map','0:v','-c','copy','-t',str(e-k1),'-strict','unofficial','-avoid_negative_ts','make_zero',f'{T}/{n}b.mp4'])
    lst+= [f"file '{T}/{n}a.mp4'",f"duration {k1-k:.6f}",f"file '{T}/{n}b.mp4'"]
    alist.append((f,k,e))
open(f'{T}/list.txt','w').write('\n'.join(lst)+'\n')
run(['-f','concat','-safe','0','-i',f'{T}/list.txt','-c','copy','-strict','unofficial',f'{T}/v.mp4'])
# 오디오: 원본 구간 그대로 이어붙임(끝 0.05초 페이드로 툭 끊김만 방지)
ins=[];fc=''
for n,(f,k,e) in enumerate(alist):
    ins+=['-i',R+f]
    d=e-k
    fc+=f'[{n}:a]atrim={k}:{e},asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st={d-0.05}:d=0.05[a{n}];'
fc+=''.join(f'[a{n}]' for n in range(len(alist)))+f'concat=n={len(alist)}:v=0:a=1[a]'
run(ins+['-filter_complex',fc,'-map','[a]','-c:a','aac','-b:a','192k',f'{T}/a.m4a'])
out=sys.argv[1]
run(['-i',f'{T}/v.mp4','-i',f'{T}/a.m4a','-map','0:v','-map','1:a','-c','copy','-strict','unofficial','-shortest','-movflags','+faststart',out])
