document.addEventListener("DOMContentLoaded", () => {

  // ================== INSERT YOUR API KEY HERE ==================
  const API_KEY = "f6e69ff791404a24b736a913676eca5e"; 
  // =============================================================

  // 7 Major Forex Pairs
  const PAIRS = [
    "EUR/USD","GBP/USD","USD/JPY","USD/CHF","USD/CAD","AUD/USD","NZD/USD"
  ];

  // DOM Elements
  const pairSelect = document.getElementById("pairSelect");
  const timeframeSelect = document.getElementById("timeframeSelect");
  const pairTitle = document.getElementById("pairTitle");
  const p1Signal = document.getElementById("p1Signal");
  const p2Signal = document.getElementById("p2Signal");
  const p3Signal = document.getElementById("p3Signal");
  const countdown = document.getElementById("countdown");

  // Populate currency pair dropdown
  PAIRS.forEach(pair => {
      let o = document.createElement("option");
      o.value = pair;
      o.textContent = pair;
      pairSelect.appendChild(o);
  });

  // State
  let selectedPair = PAIRS[0];
  let selectedTimeframe = parseInt(timeframeSelect.value);
  let nextCandle = Date.now() + selectedTimeframe*60000;
  let candleHistory = [];
  let candleHistory30m = [];

  // ==================== Event Listeners ====================
  pairSelect.addEventListener("change", async e => {
      selectedPair = e.target.value;
      await fetchAllCandleHistory();
      updateDashboard(); // Update immediately after changing pair
  });
  timeframeSelect.addEventListener("change", async e => {
      selectedTimeframe = parseInt(e.target.value);
      nextCandle = Date.now() + selectedTimeframe*60000;
      await fetchAllCandleHistory();
      updateDashboard(); // Update immediately after changing timeframe
  });

  // ==================== Fetch Candle Data ====================
  async function fetchCandleHistory(tf) {
      if(!selectedPair) return [];
      try {
          const symbol = selectedPair.replace("/", "");
          const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${tf}&outputsize=100&apikey=${API_KEY}`;
          const res = await fetch(url);
          const data = await res.json();
          if(data && data.values) {
              return data.values.reverse().map(c => ({
                  open: parseFloat(c.open),
                  high: parseFloat(c.high),
                  low: parseFloat(c.low),
                  close: parseFloat(c.close)
              }));
          }
          return [];
      } catch(err) {
          console.error("Error fetching candle history:", err);
          return [];
      }
  }

  async function fetchAllCandleHistory(){
      candleHistory = await fetchCandleHistory(selectedTimeframe+"min");
      candleHistory30m = await fetchCandleHistory("30min");
  }

  // ==================== Indicators ====================
  function EMA(values, period) {
      let k = 2 / (period + 1);
      let emaArray = [];
      values.forEach((val, i) => {
          if(i===0) emaArray.push(val);
          else emaArray.push(val*k + emaArray[i-1]*(1-k));
      });
      return emaArray;
  }

  function average(arr){
      return arr.reduce((a,b)=>a+b,0)/arr.length;
  }

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

  function MACD(values, fast=12, slow=26, signal=9){
      const emaFast = EMA(values, fast);
      const emaSlow = EMA(values, slow);
      const macdLine = emaFast.map((v,i)=>v - emaSlow[i]);
      const signalLine = EMA(macdLine.slice(slow-1), signal);
      const histogram = macdLine.slice(slow-1).map((v,i)=>v - signalLine[i]);
      return {macdLine, signalLine, histogram};
  }

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

  // ==================== Probability Calculation ====================
  function calculateProbability(candlesShort, candles30m){
      if(candlesShort.length<30 || candles30m.length<30) return {bull:0.5, neutral:0.1, bear:0.4, power:0.5};

      const closesShort = candlesShort.map(c=>c.close);
      const closes30m = candles30m.map(c=>c.close);

      function singleTFSignal(closes){
          const emaSignal = EMA(closes,9).slice(-1)[0] > EMA(closes,21).slice(-1)[0] ? 1 : -1;
          const rsiArr = RSI(closes,14);
          const rsiSignal = rsiArr[rsiArr.length-1] > 70 ? -1 : (rsiArr[rsiArr.length-1] < 30 ? 1 : 0);
          const macdObj = MACD(closes);
          const macdSignal = macdObj.histogram[macdObj.histogram.length-1]>0 ? 1 : -1;
          const bbObj = Bollinger(closes);
          const lastClose = closes[closes.length-1];
          const bbSignal = lastClose>bbObj.upper[bbObj.upper.length-1] ? -1 : (lastClose<bbObj.lower[bbObj.lower.length-1]?1:0);
          const atrArr = ATR(candlesShort);
          const atr = atrArr[atrArr.length-1] || 0;
          const trendSignal = emaSignal + macdSignal;
          const weight = {ema:0.25,rsi:0.2,macd:0.2,bb:0.15,trend:0.1};
          let rawScore = emaSignal*weight.ema + rsiSignal*weight.rsi + macdSignal*weight.macd + bbSignal*weight.bb + trendSignal*weight.trend*0.05;
          let bull = (rawScore+1)/2;
          let bear = 1-bull;
          let neutralMargin = 0.1*(1-Math.abs(rawScore));
          bull *= (1-neutralMargin);
          bear *= (1-neutralMargin);
          let neutral = neutralMargin;
          let power = Math.min(1,bull+bear)*atr/Math.max(...atrArr);
          return {bull, bear, neutral, power};
      }

      const shortProb = singleTFSignal(closesShort);
      const longProb = singleTFSignal(closes30m);

      // Weighted 50% short + 50% 30m
      const finalProb = {
          bull: parseFloat(((shortProb.bull*0.5 + longProb.bull*0.5).toFixed(2))),
          bear: parseFloat(((shortProb.bear*0.5 + longProb.bear*0.5).toFixed(2))),
          neutral: parseFloat(((shortProb.neutral*0.5 + longProb.neutral*0.5).toFixed(2))),
          power: parseFloat(((shortProb.power*0.5 + longProb.power*0.5).toFixed(2)))
      };

      return finalProb;
  }

  function updateBars(container, probs){
      const bullBar = container.querySelector(".bar-bull");
      const neutralBar = container.querySelector(".bar-neutral");
      const bearBar = container.querySelector(".bar-bear");

      bullBar.style.width = (probs.bull*100).toFixed(1) + "%";
      bullBar.textContent = probs.bull;

      neutralBar.style.width = (probs.neutral*100).toFixed(1) + "%";
      neutralBar.textContent = probs.neutral;

      bearBar.style.width = (probs.bear*100).toFixed(1) + "%";
      bearBar.textContent = probs.bear;
  }

  // ==================== Countdown ====================
  function updateCountdown(){
      let remaining = nextCandle - Date.now();
      if(remaining<0){
          nextCandle = Date.now() + selectedTimeframe*60000;
          remaining = selectedTimeframe*60000;
      }
      let m = Math.floor(remaining/60000);
      let s = Math.floor((remaining%60000)/1000);
      countdown.textContent = `Next Candle in: ${m}m ${s}s`;
  }

  // ==================== Update Dashboard ====================
  async function updateDashboard(){
      const probs = calculateProbability(candleHistory, candleHistory30m);
      pairTitle.textContent = `Forecast for ${selectedPair} (${selectedTimeframe}m aligned to 30m)`;
      updateBars(p1Signal, probs);
      updateBars(p2Signal, {...probs, bull:(probs.bull*0.9), bear:(probs.bear*0.9), neutral:(probs.neutral*0.9)});
      updateBars(p3Signal, {...probs, bull:(probs.bull*0.8), bear:(probs.bear*0.8), neutral:(probs.neutral*0.8)});
      updateCountdown();
  }

  // ==================== Initial Fetch & Intervals ====================
  fetchAllCandleHistory().then(()=>updateDashboard());

  // Update countdown every second
  setInterval(updateCountdown, 1000);

  // Update probability every 15 seconds
  setInterval(async () => {
      await fetchAllCandleHistory();
      updateDashboard();
  }, 15000);

});
