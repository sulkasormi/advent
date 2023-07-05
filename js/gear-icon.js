function settingsIconPath(a,w,o,g,p,q,r) {
  var path = "";
  var x = y = 0;
  for (let i = 0; i < g + 1; i++) {
    /* inner 1 */
    let j = (i == g) ? 0 : i;
    x = (Math.cos(a*j-w/2+o+w*j)*q).toFixed(2);
    y = (Math.sin(a*j-w/2+o+w*j)*q).toFixed(2);
    switch (i) {
      case 0: path += "M " + x + " " + y + " "; break;
      default: path += `A ${q} ${q} 0 1 0 ${x} ${y}`; break;
    }
    if (i == g) {
      path += "Z";
      /* path += `M 0 -${r} A ${r} ${r} 0 1 0 0 ${r} A ${r} ${r} 0 1 0 0 -${r} Z`; */
      break;
    }
    /* outer 1 */
    x = (Math.cos(a*i-a/2+o+w*i)*p).toFixed(2);
    y = (Math.sin(a*i-a/2+o+w*i)*p).toFixed(2);
    path += "L " + x + " " + y + " ";
    /* outer 2 */
    x = (Math.cos(a*i+a/2+o+w*i)*p).toFixed(2);
    y = (Math.sin(a*i+a/2+o+w*i)*p).toFixed(2);
    path += "L " + x + " " + y + " ";
    /* inner 2 */
    x = (Math.cos(a*i+w/2+o+w*i)*q).toFixed(2);
    y = (Math.sin(a*i+w/2+o+w*i)*q).toFixed(2);
    path += "L " + x + " " + y + " ";
  }
  return path;
}
function settingsIcon(a,w,o,g,p,q,r) {
  var xmlns = "http://www.w3.org/2000/svg";
  var myPath = document.createElementNS(xmlns,"path");
  var path = settingsIconPath(a,w,o,g,p,q,r);
  var defs = document.createElementNS(xmlns, "defs");
  var grad = document.createElementNS(xmlns, "radialGradient");
  var stop1 = document.createElementNS(xmlns, "stop");
  var stop2 = document.createElementNS(xmlns, "stop");
  mySvg.setAttributeNS(null, "viewBox", "-150,-150,300,300");
  myPath.setAttributeNS(null, "d", path);
  let s = (r/p)*100;
  let s1 = s.toFixed(2);
  let s2 = (s+0.011).toFixed(2);
  stop1.setAttributeNS(null, "offset", `${s1}%`);
  stop2.setAttributeNS(null, "offset", `${s2}%`);
  grad.setAttributeNS(null, "id", "gearicon-filler");
  stop1.setAttributeNS(null, "class", "transparent");
  mySvg.appendChild(defs);
  defs.appendChild(grad);
  grad.appendChild(stop1);
  grad.appendChild(stop2);
  mySvg.appendChild(myPath);
}
var mySvg = document.getElementById("gearIcon");
//settingsIcon(Math.PI/10, Math.PI*0.15, Math.PI - Math.PI/30, 8,  100, 75, 40);
settingsIcon(Math.PI*7/100, Math.PI*13/100, Math.PI - Math.PI/30, 10,  100, 74, 40);
//settingsIcon(Math.PI*7/117, Math.PI*11/117, Math.PI - Math.PI/30, 13,  100, 75, 40);