(function () {
  var degrees = {N:0,NNE:22.5,NE:45,ENE:67.5,E:90,ESE:112.5,SE:135,SSE:157.5,S:180,SSW:202.5,SW:225,WSW:247.5,W:270,WNW:292.5,NW:315,NNW:337.5};
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (x) { return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[x]; }); }
  function fmt(v) { return Number(v).toLocaleString("it-IT", {minimumFractionDigits:1, maximumFractionDigits:1}); }
  window.stationChartHtml = function (rows, color, lang) {
    var data = rows.slice().reverse().map(function (r) { return {time:r.ora||"–",dir:r.direzione||"–",kt:parseFloat(r.kt),gust:parseFloat(r.sunki)}; }).filter(function (r) { return !isNaN(r.kt); });
    if (data.length < 2) return "";
    var w=600,h=220,sx=42,dx=14,sy=16,base=153;
    var max=Math.max.apply(null,data.map(function(r){return isNaN(r.gust)?r.kt:Math.max(r.kt,r.gust);}));
    var yMax=Math.max(10,Math.ceil((max*1.12)/5)*5);
    var x=function(i){return sx+i*(w-sx-dx)/(data.length-1);};
    var y=function(v){return base-Math.max(0,v)/yMax*(base-sy);};
    var points=function(key){return data.map(function(r,i){var v=isNaN(r[key])?r.kt:r[key];return x(i).toFixed(1)+","+y(v).toFixed(1);}).join(" ");};
    var id="vento"+Math.random().toString(36).slice(2);
    var levels=[yMax,yMax/2,0].map(function(v){return '<line x1="'+sx+'" y1="'+y(v)+'" x2="'+(w-dx)+'" y2="'+y(v)+'" stroke="#cbd5dc" stroke-width="1" stroke-dasharray="4 5"/><text x="'+(sx-7)+'" y="'+(y(v)+4)+'" text-anchor="end" font-size="11" fill="#66717c">'+v+'</text>';}).join("");
    var axis=data.map(function(r,i){var deg=degrees[String(r.dir).toUpperCase().trim()];var arrow=deg==null?"":'<g transform="rotate('+deg+')"><path d="M0 -8V7M-4 3L0 7L4 3" fill="none" stroke="#243142" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>';return '<g transform="translate('+x(i)+',176)">'+arrow+'<text x="0" y="18" text-anchor="middle" font-size="10" font-weight="700" fill="#243142">'+esc(r.dir)+'</text><text x="0" y="36" text-anchor="middle" font-size="11" fill="#66717c">'+esc(r.time)+'</text></g>';}).join("");
    var hits=data.map(function(r,i){var gust=isNaN(r.gust)?"–":fmt(r.gust);return '<circle class="chart-hit" tabindex="0" role="button" data-time="'+esc(r.time)+'" data-dir="'+esc(r.dir)+'" data-kt="'+fmt(r.kt)+'" data-gust="'+gust+'" cx="'+x(i)+'" cy="'+y(r.kt)+'" r="17" fill="transparent"/>';}).join("");
    var area=points("kt")+" "+x(data.length-1).toFixed(1)+","+base+" "+sx+","+base;
    var labels=lang==="sl"?{wind:"veter",gust:"sunek",direction:"puščica = smer vetra"}:{wind:"vento",gust:"raffica",direction:"freccia = verso del vento"};
    return '<div class="wind-chart"><div class="chart-tip" role="status"></div><svg viewBox="0 0 '+w+' '+h+'" role="img"><defs><linearGradient id="'+id+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+color+'" stop-opacity=".20"/><stop offset="1" stop-color="'+color+'" stop-opacity=".02"/></linearGradient></defs>'+levels+'<text x="8" y="13" font-size="10" fill="#66717c">kt</text><polygon fill="url(#'+id+')" points="'+area+'"/><polyline fill="none" stroke="#9ba5ad" stroke-width="2.5" stroke-dasharray="6 4" stroke-linejoin="round" points="'+points("gust")+'"/><polyline fill="none" stroke="'+color+'" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" points="'+points("kt")+'"/>'+axis+'<g class="chart-cursore" visibility="hidden"><line y1="'+sy+'" y2="'+base+'" stroke="#243142" opacity=".35"/><circle r="5" fill="#fff" stroke="'+color+'" stroke-width="3"/></g>'+hits+'</svg><div class="chart-legend"><span class="key" style="--c:'+color+'">'+labels.wind+'</span><span class="key" style="--c:#9ba5ad">'+labels.gust+'</span><span>'+labels.direction+'</span></div></div>';
  };
  window.activateStationChart = function (container) {
    var chart=container&&container.querySelector(".wind-chart"); if(!chart)return;
    var tip=chart.querySelector(".chart-tip"),cursor=chart.querySelector(".chart-cursore");
    function show(p){var cx=p.getAttribute("cx"),cy=p.getAttribute("cy"),line=cursor.querySelector("line"),dot=cursor.querySelector("circle");cursor.setAttribute("visibility","visible");line.setAttribute("x1",cx);line.setAttribute("x2",cx);dot.setAttribute("cx",cx);dot.setAttribute("cy",cy);tip.innerHTML='<strong>'+esc(p.dataset.time)+' · '+esc(p.dataset.dir)+'</strong><br>'+p.dataset.kt+' kt · '+p.dataset.gust+' kt';chart.classList.add("attivo");}
    chart.querySelectorAll(".chart-hit").forEach(function(p){p.addEventListener("pointerenter",function(){show(p);});p.addEventListener("focus",function(){show(p);});p.addEventListener("click",function(){show(p);});});
    chart.addEventListener("pointerleave",function(){chart.classList.remove("attivo");});
  };
})();
