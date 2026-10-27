import sys
from PIL import Image, ImageDraw, ImageFont
SRC=sys.argv[1]; OUT=sys.argv[2]
F='/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
def f(s): return ImageFont.truetype(F,s)
# (사진, 자르기 시작 y, 글상자 위치, 번호, 제목, 본문, 작은 글)
S=[
 ('f1.jpg',380,'bottom',None,'그립톡,\n처음엔 이어폰 줄 감개였어요','몰랐던 그립톡 이야기','넘겨서 보기 →'),
 ('f3.jpg',330,'top','01','시작은 옷 단추 두 개','2010년, 팝소켓을 만든 미국의 철학 교수','이어폰 줄이 엉키는 게 싫어서\n폰 뒤에 큰 단추 두 개를 붙인 게 시작이에요'),
 ('f2.jpg',250,'top','02','시제품만 약 60개','접었다 폈다 하는 모양이 되기까지','줄 감개로 만들었는데\n학생들은 손잡이로 더 썼대요'),
 ('f4.jpg',420,'bottom','03','충전할 땐 카드는 빼요','맥세이프 자석이 카드를 망가뜨릴 수 있어요','애플은 폰과 충전기 사이에\n신용카드·출입카드를 두지 말라고 안내해요'),
 ('f5.jpg',60,'top','04','레진은 굳으며 열이 나요','두껍게 부을수록 더 뜨거워져요','한 번에 두껍게 부으면 기포·누런 변색이 생겨서\n얇게 나눠 붓고 기다리는 게 기본이에요'),
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
    Image.alpha_composite(im.convert('RGBA'),ov).convert('RGB').save(f'{OUT}/{i}_griptok_story.jpg',quality=92)
print('done')
