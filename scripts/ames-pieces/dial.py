from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
S=1024; img=Image.new('RGB',(S,S),(244,242,237)); d=ImageDraw.Draw(img)
# Soft silvered sunray finish
for i in range(0,360,2):
    a=math.radians(i); r=S*0.75
    shade=242+int(4*math.sin(i*0.35))
    d.line([(S/2,S/2),(S/2+r*math.cos(a),S/2+r*math.sin(a))],fill=(shade,shade-2,shade-6),width=3)
img=img.filter(ImageFilter.GaussianBlur(1.2)); d=ImageDraw.Draw(img)
ink=(28,30,36)
def rsq(inset): return [inset,inset,S-inset,S-inset]
# Railway minute track on a rounded square
for inset,w in [(70,3),(98,2)]:
    d.rounded_rectangle(rsq(inset),radius=150-inset*0.6,outline=ink,width=w)
def square_point(t,inset):
    # point on square perimeter at angle t (from 12 o'clock clockwise), projected to square
    a=t-math.pi/2; c,s=math.cos(a),math.sin(a); k=1/max(abs(c),abs(s))
    half=S/2-inset; return S/2+c*k*half, S/2+s*k*half
for m in range(60):
    t=m*2*math.pi/60
    p1=square_point(t,70); p2=square_point(t,98 if m%5 else 112)
    d.line([p1,p2],fill=ink,width=3 if m%5==0 else 2)
# Roman numerals, set along the square and turned toward the centre
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',74)
numerals=['XII','I','II','III','IIII','V','VI','VII','VIII','IX','X','XI']
for h,txt in enumerate(numerals):
    t=h*2*math.pi/12
    x,y=square_point(t,200)
    tw,th=d.textbbox((0,0),txt,font=font)[2:]
    tile=Image.new('RGBA',(tw+20,th+30),(0,0,0,0)); ImageDraw.Draw(tile).text((10,0),txt,font=font,fill=ink+(255,))
    pass
    img.paste(tile,(int(x-tile.width/2),int(y-tile.height/2)),tile)
d=ImageDraw.Draw(img)
brand=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',64)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',28)
def centred(text,font,y,spacing=0):
    w=d.textbbox((0,0),text,font=font)[2]; d.text(((S-w)/2,y),text,font=font,fill=ink)
centred('A M E S',brand,330)
centred('DE BRILLIANTE',small,410)
centred('AUTOMATIC',small,640)
img.save('dial.png',optimize=True); print(img.size)
