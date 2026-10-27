import sys
from PIL import Image, ImageDraw, ImageFont
SRC=sys.argv[1]; OUT=sys.argv[2]
F='/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
def f(s): return ImageFont.truetype(F,s)
# (사진, 자르기 시작 y, 글상자 위치, 번호, 제목, 본문, 작은 글)
S=[
 ('f1.jpg',380,'bottom',None,'그립톡 쓰는 사람만\n아는 습관','하나라도 해당되면, 당신도 그립톡러','넘겨서 보기 →'),
 ('f2.jpg',250,'top','01','손가락이 먼저 가요','폰을 들 때마다 자연스럽게','없으면 손이 허전해요'),
 ('f3.jpg',330,'top','02','붙일 자리, 한참 고민해요','카메라 피해서, 가운데 살짝 아래','한 번 붙이면 오래 함께하니까요'),
 ('f4.jpg',420,'bottom','03','괜히 만지작만지작','생각할 때도, 기다릴 때도 손에 쥐고','단단한데도 자꾸 손이 가요'),
 ('f5.jpg',60,'top','04','케이스는 바꿔도\n그립톡은 그대로','폰이 바뀌어도 데려가는 하나','나만 그래요? 댓글로 알려주세요'),
]
W,H=1080,1350; M=48
for i,(src,y0,pos,num,title,line,small) in enumerate(S,1):
    im=Image.open(f'{SRC}/{src}').convert('RGB')
    if im.size[0]!=W: im=im.resize((W,round(im.size[1]*W/im.size[0])))
    im=im.crop((0,y0,W,y0+H))
    ov=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(ov)
    ft,fl,fs,fn=f(74),f(42),f(34),f(30)
    tl=title.split('\n')
    h=M+(44 if num else 0)+92*len(tl)+60+22+48+M-10
    top=M if pos=='top' else H-M-h
    d.rounded_rectangle((M,top,W-M,top+h),36,fill=(255,255,255,232))
    x=M+44; y=top+M
    if num: d.text((x,y),f'{num} / 04',font=fn,fill=(120,120,120,255)); y+=44
    for t in tl:
        d.text((x,y),t,font=ft,fill=(17,17,17,255),stroke_width=2,stroke_fill=(17,17,17,255)); y+=92
    d.text((x,y),line,font=fl,fill=(30,30,30,255)); y+=60
    y+=18; d.line((x,y-6,x+80,y-6),fill=(17,17,17,255),width=3); y+=10
    d.text((x,y),small,font=fs,fill=(90,90,90,255))
    d.text((W-M-210,H-M-36 if pos=='top' else M-4),'THING THAT HIT',font=f(28),fill=(255,255,255,235) if pos=='top' else (40,40,40,235))
    Image.alpha_composite(im.convert('RGBA'),ov).convert('RGB').save(f'{OUT}/{i}_griptok_habits.jpg',quality=92)
print('done')
