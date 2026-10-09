Sets
i bus /1*101/
 l /1*20/
k trips /1*3/
t time / 1*288/
cl column /1,2,3,4,5,6,7/ 
startIndices(l)   
endIndices(l,t)    
;

**$call=XLS2GMS.EXE
**Table PV(t,c1)
**$include PV1.inc
**;
**
*Parameter PV1(t);
*PV1(t)=PV(t,'2');

$call=XLS2GMS.EXE
Table Bus(i,cl)
$include Roh.inc
;


Parameter C(t) cost of electricity;
Parameter Etran rating of transformer /5000/;
   

scalar bigM /0.00092/;
Parameter PL(t);
*PV1(t)=PV(t,'1');
*PL(t)=PV(t,'2');
 loop(t$(ord(t)>=1),      
     if(ord(t)>=1 and ord(t)<=73,
   C(t)= 4;
   else
   if(ord(t)>=74 and ord(t)<=120,
    C(t)= 5;
   else
   if(ord(t)>=121 and ord(t)<=157,
    C(t)=6;
    else
   if(ord(t)>=158 and ord(t)<=216,
   C(t)=5;
   else
   if(ord(t)>=217 and ord(t)<=253,
   C(t)=6;
   else
   if(ord(t)>=254 and ord(t)<=288,
   C(t)=5;
   );
   );
   );
   ););););
Parameter Tstart(i,k);
Tstart(i,'1')=Bus(i,'1');
Tstart(i,'2')=Bus(i,'3');


Parameter D(i,k);
D(i,'1')=Bus(i,'5');
D(i,'2')=Bus(i,'6');

Parameter Tstop(i,k);
Tstop(i,'1')=Bus(i,'2');
Tstop(i,'2')=Bus(i,'4');

Parameter trec(i,k);
loop(i$(ord(i)>=1),
  if (Bus(i,'3')>0,
     trec(i,'1')=(Bus(i,'3')-Bus(i,'2'))*5;
     trec(i,'2')=(288-Bus(i,'4'))*5;
   else
     trec(i,'1')=(288-Bus(i,'1'))*5;
););

Parameter F(i);
loop(i$(ord(i)>=1),
  loop(k$(ord(k)>=1 and trec(i,k)=0),
    F(i)=ord(k);
    break;
    );
   );

Parameter Eb/360/;
Parameter Pch/240/;
Parameter Nch/16/;

Set P(i,k)  ;
p(i,k)$(ord(k)=f(i))= yes;

display Tstart,D,Tstop,trec,F,p;


variables
    
    z operational cost
    SOC_arr(i,k) Arrival SOC,A(i,k)
    SOC_dep(i,k) Departure SOC,D1(i,k)
    Tchg(i,k) charging time 
    x(i,t),b(i,k),u(i,k),y(i,t)
    N(t),Nchs,s1(l,t);
    integer variable Tchg;
    binary variables x,b,s1;
    
Equations
    cst  define objective function
    
    Arr(i,k) SOC arrival limit, Dep(i,k) SOC departure limit
    Ar(i,k), Dp(i,k)
    In(i,k),
    T_chgl(i,k) ,T_chgup(i,k),Depl(i,k)
     binl(i,k)
    bing(i,k)
    mat1(i,k)
    mat2(i,k)
    ul1(i,k)
    ul2(i,k)
    ug1(i,k)
    ug2(i,k)
    ygx1(i,t)
    ygx2(i,t)
    
    sumx(t), ass(t)
    nums(t),num(t);
    
    In(i,'1')..   SOC_dep(i,'1')=e=0.9;
     cst..         z=e=sum(t,((sum(i,x(i,t))*C(t)*Pch)*5/60));
    T_chgl(i,k).. Tchg(i,k)=g=5;
    T_chgup(i,k).. Tchg(i,k)=l=trec(i,k)+5;
    Ar(i,k+1)..    SOC_arr(i,k)=e=SOC_dep(i,k)-1.3*d(i,k)/Eb;
    Dp(i,k+1)..   SOC_dep(i,k+1)=e=SOC_arr(i,k)+0.92*(Tchg(i,k)-5)/60*Pch/Eb;
    Arr(i,k)..    SOC_arr(i,k)=g=0.2;
    Dep(i,k)..    SOC_dep(i,k+1)=l=1;
    Depl(i,k)..   SOC_dep(i,k)=g=0.92$p(i,k); 
    binl(i,k)..   b(i,k)=l=1-bigM*(Tchg(i,k)-5);
    bing(i,k)..   b(i,k)=g=0.00001+bigM*(5-Tchg(i,k));
    mat1(i,k)..   sum(t$(Tstop(i,k)+1<=ord(t) and ord(t)<=(Tstop(i,k)+(trec(i,k)+5)/5)),x(i,t))=e=(Tchg(i,k)/5-u(i,k)/5);
    
    ul1(i,k)..    u(i,k)=g=5*b(i,k);
    ul2(i,k)..    u(i,k)=g=Tchg(i,k)+b(i,k)*(trec(i,k)+5)-(trec(i,k)+5);
    ug1(i,k)..    u(i,k)=l=Tchg(i,k)+5*b(i,k)-5;
    ug2(i,k)..    u(i,k)=l=b(i,k)*(trec(i,k)+5);
    ygx1(i,t)..    y(i,t)=g=x(i,t+1)-x(i,t);
    ygx2(i,t)..    y(i,t)=g=x(i,t)-x(i,t+1);

    mat2(i,k)..   sum(t$(Tstop(i,k)<=ord(t) and ord(t)<=(Tstop(i,k)+(trec(i,k)+5)/5)),y(i,t))=e=2*(1-b(i,k));
    
    sumx(t)..      N(t)=e=sum(i,x(i,t));
    nums(t)..      Nchs=g=N(t);
    num(t)..       Nchs=l=Nch;
    ass(t)..       sum(l,s1(l,t))=e=sum(i,x(i,t));
    
    
 Model transport /all/;
 Solve transport using mip minimizing z;
 Display Tchg.l SOC_arr.l,SOC_dep.l,x.l,Nchs.l, Tstop,P,trec,d;
*execute_unload "oper_depot.gdx" Tchg.l SOC_arr.l,SOC_dep.l,x.l,Nchs.l,N.l,C;

Parameter M(l,t);
scalar s/1/;

  loop(t,
    s=1;
   loop(i$(x.l(i,t) = 1),
       loop(l$(ord(l)=s),
        M(l,t) = ord(i);
        s=s+1;
        break;
       ) 
    ););
    M(l,t)=0.5+M(l,t)
execute_unload "oper_depot.gdx" Tchg.l SOC_arr.l,SOC_dep.l,x.l,Nchs.l,N.l,C,M,s1.l;

