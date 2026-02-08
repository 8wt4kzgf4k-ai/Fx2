// ================== INSERT YOUR API KEY HERE ==================
const API_KEY = "03df54131c4144b58b58aa146c0fcecf"; 
// =============================================================

// Currency Pairs
const PAIRS = [
  "EUR/USD","GBP/USD","USD/JPY","USD/CHF","USD/CAD","AUD/USD","NZD/USD",
  "EUR/GBP","EUR/JPY","GBP/JPY","AUD/JPY","EUR/AUD","GBP/CHF","AUD/CAD",
  "EUR/NZD","CAD/JPY","CHF/JPY","NZD/JPY","GBP/CAD"
];

// DOM Elements
const pairSelect = document.getElementById("pairSelect");
PAIRS.forEach(pair => {
  let o = document.createElement("option");
  o.value = pair;
  o.textContent = pair;
  pairSelect.appendChild(o);
});

const pairTitle = document.getElementById("pairTitle");
const p1Signal = document.getElementById("p1Signal");
const p2Signal = document.getElementById("p2Signal");
const p3Signal = document.getElementById("p3Signal");
const countdown = document.getElementById("countdown");
const timeframeSelect = document.getElementById("timeframeSelect");

// State
let selectedPair = PAIRS[0];
let selectedTimeframe = 1; // default 1 minute
let nextCandle = Date.now() + selectedTimeframe*60*1000;

// Candle history for selected pair
let candleHistory = [];

// Event handlers
pairSelect.addEventListener("change", e => {
    selectedPair = e.target.value;
    fetchCandleHistory();
});
timeframeSelect.addEventListener("change", e => {
    selectedTimeframe = parseInt(e.target.value);
    nextCandle = Date.now() + selectedTimeframe * 60000;
    fetchCandleHistory();
});

// ======================== API & Data Fetch ========================
async function fetchCandleHistory() {
    if(!selectedPair) return;
    try {
        const symbol = selectedPair.replace("/", "");
        const interval = selectedTimeframe + "min";
        const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&outputsize=100&apikey=${API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        if(data && data.values) {
            candleHistory = data.values.reverse().map(c => ({
                open: parseFloat(c.open),
                high: parseFloat(c.high),
                low: parseFloat(c.low),
                close: parseFloat(c.close)
            }));
        }
    } catch(err) {
        console.error("Error fetching candle history:", err);
    }
}

// ======================== INDICATOR FUNCTIONS ========================
// EMA calculation
function EMA(values, period) {
    let k = 2 / (period + 1);
    let emaArray = [];
    values.forEach((val, i) => {
        if(i===0) emaArray.push(val);
        else emaArray.push(val*k + emaArray[i-1]*(1-k));
    });
    return emaArray;
}

// RSI calculation
function RSI(values, period = 14) {
    let gains = [], losses = [];
    for(let i=1;i<values.length;i++){
        let diff = values[i] - values[i-1];
        gains.push(diff>0 ? diff : 0);
        losses.push(diff<0 ? -diff : 0);
    }
    let rsiArray = [];
    let avgGain = average(gains.slice(0,period));
    let avgLoss = average(losses.slice(0,period));
    rsiArray[period] = 100 - (100 / (1 + avgGain/avgLoss));
    for(let i=period+1;i<values.length;i++){
        avgGain = (avgGain*(period-1)+gains[i-1])/period;
        avgLoss = (avgLoss*(period-1)+losses[i-1])/period;
        rsiArray[i] = 100 - (100 / (1 + avgGain/avgLoss));
    }
    return rsiArray;
}

function average(arr){
    return arr.reduce((a,b)=>a+b,0)/arr.length;
}

// MACD calculation
function MACD(values, fast=12, slow=26, signal=9){
    const emaFast = EMA(values, fast);
    const emaSlow = EMA(values, slow);
    const macdLine = emaFast.map((v,i)=>v - emaSlow[i]);
    const signalLine = EMA(macdLine.slice(slow-1), signal);
    const histogram = macdLine.slice(slow-1).map((v,i)=>v - signalLine[i]);
    return {macdLine, signalLine, histogram};
}

// Bollinger Bands
function Bollinger(values, period=20, mult=2){
    let middle = EMA(values, period);
    let stds = [];
    for(let i=period-1;i<values.length;i++){
        let slice = values.slice(i-period+1, i+1);
        let avg = average(slice);
        let variance = average(slice.map(v=>Math.pow(v-avg,2)));
        stds.push(Math.sqrt(variance));
    }
    let upper = middle.slice(period-1).map((v,i)=>v + mult*stds[i]);
    let lower = middle.slice(period-1).map((v,i)=>v - mult*stds[i]);
    return {upper, middle: middle.slice(period-1), lower};
}

// ATR calculation
function ATR(candles, period=14){
    let trs = [];
    for(let i=1;i<candles.length;i++){
        let c = candles[i], p = candles[i-1];
        let tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
        trs.push(tr);
    }
    let atrArray = [];
    atrArray[period-1] = average(trs.slice(0,period));
    for(let i=period;i<trs.length;i++){
        atrArray[i] = (atrArray[i-1]*(period-1)+trs[i])/period;
    }
    return atrArray;
}

// ======================== PROBABILITY & SIGNAL ========================
function calculateProbability(){
    if(candleHistory.length<30) return {p1:50,p2:50,p3:50,conf:50};
    const closes = candleHistory.map(c=>c.close);

    // EMA
    const emaFast = EMA(closes, 9);
    const emaSlow = EMA(closes, 21);
    const emaSignal = emaFast[emaFast.length-1] > emaSlow[emaSlow.length-1] ? 1 : -1;

    // RSI
    const rsiArray = RSI(closes, 14);
    const rsiSignal = rsiArray[rsiArray.length-1] > 70 ? -1 : (rsiArray[rsiArray.length-1] < 30 ? 1 : 0);

    // MACD
    const macdObj = MACD(closes);
    const macdSignal = macdObj.histogram[macdObj.histogram.length-1] > 0 ? 1 : -1;

    // Bollinger Bands
    const bbObj = Bollinger(closes);
    const lastClose = closes[closes.length-1];
    const bbSignal = lastClose > bbObj.upper[bbObj.upper.length-1] ? -1 :
                     (lastClose < bbObj.lower[bbObj.lower.length-1] ? 1 : 0);

    // ATR
    const atrArray = ATR(candleHistory);
    const atr = atrArray[atrArray.length-1] || 0;
    const atrSignal = atr > 0 ? 1 : 0; // contributes to confidence

    // Weighted sum
    const weight = {ema:0.25, rsi:0.2, macd:0.2, bb:0.15, atr:0.1, trend:0.1};
    const trendSignal = emaSignal + macdSignal; // simple trend measure

    let prob = 50 + emaSignal*weight.ema*100 + rsiSignal*weight.rsi*100 + macdSignal*weight.macd*100 + bbSignal*weight.bb*100 + trendSignal*weight.trend*10;
    prob = Math.max(5, Math.min(95, prob));
    let conf = Math.min(100, prob*atr*2 + 10);

    return {
        p1: Math.round(prob),
        p2: Math.round(prob*0.9),
        p3: Math.round(prob*0.8),
        conf: Math.round(conf)
    };
}

function getSignalClass(prob){
    if(prob>=75) return {text:"Bullish ↑", className:"bullish"};
    if(prob>=65) return {text:"Neutral ●", className:"neutral"};
    return {text:"Bearish ↓", className:"bearish"};
}

// ======================== UPDATE DASHBOARD ========================
function updateDashboard(){
    const probs = calculateProbability();
    pairTitle.textContent = `Forecast for ${selectedPair} (${selectedTimeframe}m)`;

    let s1 = getSignalClass(probs.p1);
    p1Signal.innerHTML = `Next Candle: <span class="${s1.className}">${s1.text}</span> (${probs.p1}%) - Power: ${probs.conf}%`;

    let s2 = getSignalClass(probs.p2);
    p2Signal.innerHTML = `2nd Candle: <span class="${s2.className}">${s2.text}</span> (${probs.p2}%) - Power: ${probs.conf}%`;

    let s3 = getSignalClass(probs.p3);
    p3Signal.innerHTML = `3rd Candle: <span class="${s3.className}">${s3.text}</span> (${probs.p3}%) - Power: ${probs.conf}%`;

    let remaining = nextCandle - Date.now();
    if(remaining<0){
        nextCandle = Date.now() + selectedTimeframe*60000;
        fetchCandleHistory();
        remaining = selectedTimeframe*60000;
    }
    let m = Math.floor(remaining/60000);
    let s = Math.floor((remaining%60000)/1000);
    countdown.textContent = `Next Candle in: ${m}m ${s}s`;
}

fetchCandleHistory();
setInterval(updateDashboard, 1000); // update dashboard every second
setInterval(fetchCandleHistory, 5000); // fetch new candles every 5 seconds
