import sys
from PIL import Image, ImageDraw, ImageFont
SRC=sys.argv[1]; OUT=sys.argv[2]
F='/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
def f(s): return ImageFont.truetype(F,s)
S=[
 ('s1.jpg',300,'top',None,'경화 · 탈형 · 황변','레진 그립톡 만들 때 쓰는 말,\n무슨 뜻인지 아세요?','레진 용어 노트 · 넘겨서 보기 →'),
 ('s2.jpg',420,'top','01','2액형 vs UV레진','두 액을 섞어 굳히거나, 빛을 쬐어 굳히거나','2액형: 주제와 경화제가 반응해 굳어요\nUV레진: 자외선을 받으면 몇 분 만에 굳어요'),
 ('s3.jpg',250,'bottom','02','경화','액체 레진이 단단하게 굳는 것','2액형은 분자가 그물처럼 엮이며 천천히 굳어요\n제품에 따라 몇 시간에서 하루까지 기다려요'),
 ('s4.jpg',420,'top','03','기포','섞을 때 들어간 작은 공기 방울','천천히 오래 섞고, 표면 기포는 열로 빼요\n투명한 하트라 하나만 보여도 다시 만들어요'),
 ('s5_2.8.jpg',230,'bottom','04','탈형','다 굳은 레진을 몰드에서 꺼내는 순간','실리콘 몰드는 말랑해서 잘 빠지고\n딱딱한 몰드는 이형제를 먼저 발라요'),
 ('s6.jpg',260,'bottom','05','쉐이커','안에 오일을 넣어, 흔들면 움직이는 구조','아이원츄는 하트 안에서\nI WANT YOU 글자가 떠다녀요'),
 ('s7.jpg',430,'top','06','황변','시간이 지나며 누렇게 변하는 것','자외선과 열이 원인이라, 직사광선을 피해\n보관하면 늦출 수 있어요 · 저장해 두세요 🖤'),
]
W,H=1080,1350; M=48
for i,(src,y0,pos,num,title,line,small) in enumerate(S,1):
    im=Image.open(f'{SRC}/{src}').convert('RGB').crop((0,y0,1080,y0+H))
    ov=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(ov)
    ft,fl,fs,fn=f(78),f(44),f(34),f(30)
    lines_l=line.split('\n'); lines_s=small.replace(' 🖤','').split('\n')
    h=M+ (40 if num else 0) + 90 + 60*len(lines_l) + 22 + 48*len(lines_s) + M-10
    top= M if pos=='top' else H-M-h
    d.rounded_rectangle((M,top,W-M,top+h),36,fill=(255,255,255,232))
    x=M+44; y=top+M
    if num:
        d.text((x,y),f'{num} / 06',font=fn,fill=(120,120,120,255)); y+=44
    d.text((x,y),title,font=ft,fill=(17,17,17,255),stroke_width=2,stroke_fill=(17,17,17,255)); y+=96
    for l in lines_l: d.text((x,y),l,font=fl,fill=(30,30,30,255)); y+=60
    y+=18; d.line((x,y-6,x+80,y-6),fill=(17,17,17,255),width=3); y+=10
    for l in lines_s: d.text((x,y),l,font=fs,fill=(90,90,90,255)); y+=48
    d.text((W-M-210,H-M-36 if pos=='top' else M-4),'THING THAT HIT',font=f(28),fill=(255,255,255,235) if pos=='top' else (40,40,40,235))
    out=Image.alpha_composite(im.convert('RGBA'),ov).convert('RGB')
    out.save(f'{OUT}/{i}_resin_terms.jpg',quality=92)
print('done')
