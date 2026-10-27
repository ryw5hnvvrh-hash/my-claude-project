import sys
from PIL import Image, ImageDraw, ImageFont
SRC=sys.argv[1]; OUT=sys.argv[2]
F='/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
def f(s): return ImageFont.truetype(F,s)
# (사진, 자르기 시작 y, 글상자 위치, 번호, 제목, 본문, 작은 글)
S=[
 ('f1.jpg',380,'bottom',None,'그립톡,\n이것만 알면 오래 써요','붙이기 · 충전 · 레진 관리','저장해 두고 넘겨서 보기 →'),
 ('f3.jpg',330,'top','01','붙이기 전엔 깨끗하게','먼지·유분이 남으면 접착력이 떨어져요','마른 천으로 닦고, 물기 없이 완전히 말린 뒤 붙여요'),
 ('f2.jpg',250,'top','02','자리는 손에 대 보고','정답은 없어요, 쥐었을 때 편한 곳이 제자리','갤럭시는 결제(NFC) 자리를 피하면\n삼성페이 인식이 약해지지 않아요'),
 ('f4.jpg',420,'bottom','03','무선충전은 떼고 하기','붙인 채로는 두께 때문에 충전이 잘 안 돼요','맥세이프형은 충전할 때만 잠깐 떼어 두세요'),
 ('f5.jpg',60,'top','04','레진은 햇빛을 피해서','직사광선과 열이 누렇게 변하는(황변) 원인이에요','닦을 땐 마른 부드러운 천으로 살살\n오래 투명하게 쓰는 방법이에요'),
]
W,H=1080,1350; M=48
for i,(src,y0,pos,num,title,line,small) in enumerate(S,1):
    im=Image.open(f'{SRC}/{src}').convert('RGB')
    if im.size[0]!=W: im=im.resize((W,round(im.size[1]*W/im.size[0])))
    im=im.crop((0,y0,W,y0+H))
    ov=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(ov)
    ft,fl,fs,fn=f(70),f(38),f(32),f(30)
    tl=title.split('\n')
    sl=small.split('\n')
    h=M+(44 if num else 0)+88*len(tl)+56+22+44*len(sl)+M-10
    top=M if pos=='top' else H-M-h
    d.rounded_rectangle((M,top,W-M,top+h),36,fill=(255,255,255,232))
    x=M+44; y=top+M
    if num: d.text((x,y),f'{num} / 04',font=fn,fill=(120,120,120,255)); y+=44
    for t in tl:
        d.text((x,y),t,font=ft,fill=(17,17,17,255),stroke_width=2,stroke_fill=(17,17,17,255)); y+=88
    d.text((x,y),line,font=fl,fill=(30,30,30,255)); y+=56
    y+=18; d.line((x,y-6,x+80,y-6),fill=(17,17,17,255),width=3); y+=10
    for l in sl: d.text((x,y),l,font=fs,fill=(90,90,90,255)); y+=44
    d.text((W-M-210,H-M-36 if pos=='top' else M-4),'THING THAT HIT',font=f(28),fill=(255,255,255,235) if pos=='top' else (40,40,40,235))
    Image.alpha_composite(im.convert('RGBA'),ov).convert('RGB').save(f'{OUT}/{i}_griptok_tips.jpg',quality=92)
print('done')
