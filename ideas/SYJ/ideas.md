# idea
<br>
<h2>개요</h2>
<br>
<h4>떨어지는 물체의 충격량 측정</h4>
<p>우측에 사용자 조작 인터페이스<br>ex)우측에서 낙하할 물체와 높이, 질량, 공기밀도를 정할 수 있도록 하고.<br>충격량을 견딜 물체의 종류, 밀도, 두께, 질량을 정할 수 있게 한다</p>
<h3>실현방식</h3>
<h4>내가 solid edge를 이용해 로하에게 3d 모델을 전달하고, 로하는 3d 파일을 불러온다.</h4>
<p>gemini 및 codex를 이용해 중력과 중력가속도를 구현한다</p>
<h3>공기저항 구현방식</h3>
<h4>공기 입자를 하나씩 렌더하여 이의 저항을 물리적으로 준다<br>단점 : 렌더가 매우 복잡하여 최적화를 하기가 힘들어진다, 웬만한 성능으로 돌릴 수 없음</h4>
<h4>대안 : 물체의 표면적을 계산하여 공기밀도(비례상수 k)를 설정하였을 떄<br>표면적에 맞는 공기입자의 양을 산정하고 이의 반발력을 측정하여 g에서 빼준다(g는 9.8로 가정한다)-> 30fps로 하여 프레임단위로 계산한다.(g=9.8m/s, 1frame 당 가속도는 9.8m/30s)이다.</h4>
How to download Solidedge(if you want to use the CAD program)
<input type="<img width="1732" height="877" alt="image" src="https://github.com/user-attachments/assets/0799af92-00a8-4b6c-8c27-327a9956fd0f" />
