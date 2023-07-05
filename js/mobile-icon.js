function makeCone(rot) {
  let xSign = Math.round(Math.cos(Math.PI * rot / 2));
  let ySign = Math.round(Math.sin(Math.PI * rot / 2));
  let x1Sign = xSign || ((rot < 2) ? 1 : -1);
  let y1Sign = ySign || ((rot < 2) ? 1 : -1);
  let x2Sign = (rot % 2) ? (x1Sign * -1) : x1Sign;
  let y2Sign = (rot % 2) ? y1Sign : (y1Sign * -1);
  var path = `M ${-150*xSign} ${-150*ySign} L ${-50*x1Sign} ${-50*y1Sign} A 70.7 70.7 0 0 ${rot % 2} ${-50*x2Sign} ${-50*y2Sign} Z`;
  return path;
}
(function mobileIcon() {
  var xmlns = "http://www.w3.org/2000/svg";  
  var mySvg = document.getElementById("mobIcon");
  for (let i = 0; i < 4; i++) {
    var holderSvg = document.createElementNS(xmlns, "svg");
    var myPath = document.createElementNS(xmlns, "path");
    var path = makeCone(i);
    holderSvg.setAttribute("x", -150);
    holderSvg.setAttribute("y", -150);
    holderSvg.setAttribute("viewBox", "-150,-150,300,300");
    myPath.setAttributeNS(null, "d", path);
    myPath.setAttributeNS(null, "id", `mobicon-${i}`);
      //"d", "M -70.50 22.50 L -97.70 21.30 L -100.00 -0.52 L -73.63 -7.35 A 74 74 0 1 0 -70.26 -23.24L -91.57 -40.19 L -80.59 -59.20 L -55.25 -49.23 A 74 74 0 1 0 -43.18 -60.09L -50.45 -86.34 L -30.40 -95.27 L -15.76 -72.30 A 74 74 0 1 0 0.39 -74.00L 9.93 -99.51 L 31.40 -94.94 L 29.74 -67.76 A 74 74 0 1 0 43.81 -59.64L 66.52 -74.66 L 81.21 -58.35 L 63.89 -37.34 A 74 74 0 1 0 70.50 -22.50L 97.70 -21.30 L 100.00 0.52 L 73.63 7.35 A 74 74 0 1 0 70.26 23.24L 91.57 40.19 L 80.59 59.20 L 55.25 49.23 A 74 74 0 1 0 43.18 60.09L 50.45 86.34 L 30.40 95.27 L 15.76 72.30 A 74 74 0 1 0 -0.39 74.00L -9.93 99.51 L -31.40 94.94 L -29.74 67.76 A 74 74 0 1 0 -43.81 59.64L -66.52 74.66 L -81.21 58.35 L -63.89 37.34 A 74 74 0 1 0 -70.50 22.50Z");
    holderSvg.appendChild(myPath);
    mySvg.appendChild(holderSvg);
  }
  var holderSvg = document.createElementNS(xmlns, "svg");
  var myCircle = document.createElementNS(xmlns, "circle");
  holderSvg.setAttribute("x", -150);
  holderSvg.setAttribute("y", -150);
  holderSvg.setAttribute("viewBox", "-150,-150,300,300");
  myCircle.setAttributeNS(null, "r", 70.7);
  myCircle.setAttributeNS(null, "id", "mobicon-5");
  holderSvg.appendChild(myCircle);
  mySvg.appendChild(holderSvg);
  mySvg.setAttributeNS(null, "viewBox", "-150,-150,300,300");
})();