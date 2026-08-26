"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Check, ChevronRight, CircleHelp, Compass,
  Eraser, ExternalLink, LoaderCircle, LocateFixed, LockKeyhole, MapPin,
  PenLine, RotateCcw, Search, ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { type RuleResult, type Stroke, runRuleEngine } from "@/lib/rule-engine";

type Stage = "setup" | "write" | "confirm" | "sealed" | "result";
type LocationMode = "manual" | "device";

const stages = [
  { key: "setup", label: "寻物", number: "一" },
  { key: "write", label: "写字", number: "二" },
  { key: "confirm", label: "确认", number: "三" },
  { key: "result", label: "线索", number: "四" },
] as const;

function stageIndex(stage: Stage) {
  if (stage === "sealed") return 2;
  return Math.max(0, stages.findIndex((item) => item.key === stage));
}

function formatTime(value: Date | null) {
  if (!value) return "尚未落笔";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
    minute: "2-digit", second: "2-digit", hour12: false,
  }).format(value);
}

function CompassMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "compass-mark compass-mark--compact" : "compass-mark"} aria-hidden="true">
      <span className="compass-mark__north">北</span><span className="compass-mark__east">东</span>
      <span className="compass-mark__south">南</span><span className="compass-mark__west">西</span>
      <span className="compass-mark__needle" /><span className="compass-mark__center">字</span>
    </div>
  );
}

function WritingCanvas({ strokes, setStrokes, onFirstStroke }: {
  strokes: Stroke[];
  setStrokes: React.Dispatch<React.SetStateAction<Stroke[]>>;
  onFirstStroke: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStroke = useRef<Stroke | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(rect.width * ratio)) {
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    context.strokeStyle = "#171512";
    context.lineWidth = 7;
    context.lineCap = "round";
    context.lineJoin = "round";
    strokes.forEach((stroke) => {
      if (!stroke.length) return;
      context.beginPath();
      context.moveTo(stroke[0].x * rect.width, stroke[0].y * rect.height);
      stroke.slice(1).forEach((point) => context.lineTo(point.x * rect.width, point.y * rect.height));
      if (stroke.length === 1) context.lineTo(stroke[0].x * rect.width + 0.1, stroke[0].y * rect.height + 0.1);
      context.stroke();
    });
  }, [strokes]);

  useEffect(() => {
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (strokes.length === 0) onFirstStroke();
    activeStroke.current = [point(event)];
    setStrokes((current) => [...current, activeStroke.current ?? []]);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!activeStroke.current) return;
    event.preventDefault();
    activeStroke.current.push(point(event));
    const nextStroke = [...activeStroke.current];
    setStrokes((current) => [...current.slice(0, -1), nextStroke]);
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!activeStroke.current) return;
    event.preventDefault();
    activeStroke.current = null;
  }

  return (
    <canvas ref={canvasRef} className="writing-canvas" aria-label="在这里写下一个字"
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
  );
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("setup");
  const [itemName, setItemName] = useState("");
  const [locationMode, setLocationMode] = useState<LocationMode>("manual");
  const [manualOrigin, setManualOrigin] = useState("");
  const [deviceOrigin, setDeviceOrigin] = useState("");
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [locationError, setLocationError] = useState("");
  const [selfConfirmed, setSelfConfirmed] = useState(false);
  const [disclaimerConfirmed, setDisclaimerConfirmed] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [recognizedCharacter, setRecognizedCharacter] = useState("");
  const [firstStrokeAt, setFirstStrokeAt] = useState<Date | null>(null);
  const [finalConfirmed, setFinalConfirmed] = useState(false);
  const [revealedRound, setRevealedRound] = useState(0);
  const [ruleResult, setRuleResult] = useState<RuleResult | null>(null);
  const currentStage = stageIndex(stage);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "当地时区";
  const origin = locationMode === "manual" ? manualOrigin.trim() : deviceOrigin;

  function clearWriting() {
    setStrokes([]); setRecognizedCharacter(""); setFirstStrokeAt(null); setFinalConfirmed(false);
  }
  function restart() {
    setStage("setup"); setItemName(""); setManualOrigin(""); setDeviceOrigin("");
    setLocationMode("manual"); setLocationStatus("idle"); setLocationError("");
    setSelfConfirmed(false); setDisclaimerConfirmed(false); clearWriting();
    setRevealedRound(0); setRuleResult(null);
  }

  function requestDeviceLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("error"); setLocationError("当前浏览器不支持设备定位，请改用手动填写。"); return;
    }
    setLocationStatus("loading"); setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude.toFixed(5);
        const longitude = position.coords.longitude.toFixed(5);
        const accuracy = Math.round(position.coords.accuracy);
        setDeviceOrigin(`设备位置 ${latitude}, ${longitude}（误差约 ${accuracy} 米）`);
        setLocationStatus("ready");
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED ? "你没有授权定位，请改用手动填写。" : "暂时无法取得位置，请改用手动填写。";
        setLocationStatus("error"); setLocationError(message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function sealRecord() {
    if (!firstStrokeAt) return;
    setRuleResult(runRuleEngine({ character: recognizedCharacter, strokes, time: firstStrokeAt, origin }));
    setRevealedRound(0);
    setStage("sealed");
    window.setTimeout(() => setStage("result"), 900);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#eee9df] text-[#171512]">
      <div className="site-noise" />
      <div className="mx-auto min-h-screen max-w-[1500px] px-4 py-4 sm:px-7 sm:py-7">
        <header className="relative z-10 flex items-center justify-between border-b border-black/15 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full border border-black/70"><Compass className="size-4" strokeWidth={1.6} /></div>
            <div><p className="font-serif text-lg font-semibold tracking-[0.12em]">一字寻物</p><p className="text-[10px] uppercase tracking-[0.24em] text-black/45">Public alpha · 0.2</p></div>
          </div>
          <span className="rounded-full border border-[#a63f2d]/25 px-3 py-1.5 text-[11px] text-[#7e2f22]">任何人持链接可用</span>
        </header>

        <div className="relative z-10 grid min-h-[calc(100vh-104px)] grid-cols-1 gap-6 pt-6 lg:grid-cols-[230px_minmax(0,1fr)_260px] lg:gap-10">
          <aside className="hidden flex-col justify-between lg:flex">
            <nav aria-label="推演进度" className="space-y-1 pt-4">
              {stages.map((item, index) => {
                const active = index === currentStage;
                const complete = index < currentStage;
                return <div key={item.key} className={`stage-item ${active ? "stage-item--active" : ""} ${complete ? "stage-item--complete" : ""}`}>
                  <span className="stage-item__number">{complete ? <Check className="size-3" /> : item.number}</span><span>{item.label}</span>
                </div>;
              })}
            </nav>
            <div className="pb-4"><CompassMark compact /><p className="mt-5 max-w-[185px] text-xs leading-6 text-black/45">方向以最终确认时设备所在位置为中心。当前网页原型暂不读取硬件罗盘。</p></div>
          </aside>

          <section className="flex min-w-0 items-center justify-center py-2 lg:py-8"><div className="w-full max-w-[720px]">
            {stage === "setup" && <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <p className="section-kicker">本人寻物 · 第一步</p>
              <h1 className="mt-4 max-w-xl font-serif text-4xl leading-[1.15] font-medium tracking-[-0.03em] sm:text-6xl">先说清楚，<span className="text-[#a63f2d]">你在找什么。</span></h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-black/55 sm:text-base">只填写由你本人经手后遗失、现在也由你亲自寻找的物品。系统不接受替他人推演。</p>
              <div className="paper-panel mt-10 p-5 sm:p-7">
                <label htmlFor="item-name" className="text-xs font-medium tracking-[0.12em] text-black/55">物品名称</label>
                <Input id="item-name" value={itemName} onChange={(e) => setItemName(e.target.value.slice(0, 24))} placeholder="例如：黑色钱包、银色戒指、车钥匙" className="mt-3 h-13 rounded-none border-0 border-b border-black/25 bg-transparent px-0 text-lg shadow-none focus-visible:border-black focus-visible:ring-0" />
                <div className="mt-7 border-t border-black/10 pt-6">
                  <div className="flex items-center gap-2 text-xs font-medium tracking-[0.12em] text-black/55"><MapPin className="size-3.5" /> 推演地点</div>
                  <p className="mt-2 text-xs leading-5 text-black/45">方向会以这里为原点。可以写“家中客厅、公司工位”，不需要填写家庭门牌。</p>
                  <RadioGroup value={locationMode} onValueChange={(value) => setLocationMode(value as LocationMode)} className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className={`location-choice ${locationMode === "manual" ? "location-choice--active" : ""}`}>
                      <RadioGroupItem value="manual" className="border-black/30 text-[#a63f2d]" />
                      <span><strong>手动填写</strong><small>最准确，也最少收集信息</small></span>
                    </label>
                    <label className={`location-choice ${locationMode === "device" ? "location-choice--active" : ""}`}>
                      <RadioGroupItem value="device" className="border-black/30 text-[#a63f2d]" />
                      <span><strong>使用设备位置</strong><small>需要浏览器明确授权</small></span>
                    </label>
                  </RadioGroup>
                  {locationMode === "manual" ? (
                    <Input id="manual-origin" value={manualOrigin} onChange={(e) => setManualOrigin(e.target.value.slice(0, 40))} placeholder="例如：家中客厅" className="mt-4 h-11 rounded-none border-0 border-b border-black/25 bg-transparent px-0 shadow-none focus-visible:border-black focus-visible:ring-0" />
                  ) : (
                    <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.025] p-4">
                      <Button type="button" variant="outline" onClick={requestDeviceLocation} disabled={locationStatus === "loading"} className="rounded-full border-black/20 bg-transparent">
                        {locationStatus === "loading" ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}
                        {locationStatus === "ready" ? "重新检测" : "授权并检测位置"}
                      </Button>
                      {deviceOrigin && <p className="mt-3 text-xs leading-5 text-black/60">{deviceOrigin}</p>}
                      {locationError && <p className="mt-3 text-xs leading-5 text-[#a63f2d]">{locationError}</p>}
                    </div>
                  )}
                  <div className="privacy-note mt-4">
                    <ShieldCheck className="size-4 shrink-0" />
                    <p>应用不会通过 IP 推测地点。你授权的坐标或手填地点只保留在本次页面内，不写入数据库；网站托管网络仍会像普通网站一样处理连接所需的 IP。</p>
                  </div>
                </div>
                <div className="mt-7 space-y-4 border-t border-black/10 pt-6">
                  <label className="flex cursor-pointer items-start gap-3 text-sm leading-6"><Checkbox checked={selfConfirmed} onCheckedChange={(v) => setSelfConfirmed(v === true)} className="mt-1 border-black/35 data-[state=checked]:border-[#a63f2d] data-[state=checked]:bg-[#a63f2d]" /><span>我确认这是由我本人经手后遗失、现在由我亲自寻找的物品。</span></label>
                  <label className="flex cursor-pointer items-start gap-3 text-sm leading-6"><Checkbox checked={disclaimerConfirmed} onCheckedChange={(v) => setDisclaimerConfirmed(v === true)} className="mt-1 border-black/35 data-[state=checked]:border-[#a63f2d] data-[state=checked]:bg-[#a63f2d]" /><span>我理解本系统仅依据固定传统规则提供寻找提示，不保证物品一定能够找回。</span></label>
                </div>
              </div>
              <div className="mt-6 flex justify-end"><Button size="lg" disabled={!itemName.trim() || !origin || !selfConfirmed || !disclaimerConfirmed} onClick={() => setStage("write")} className="h-12 rounded-full bg-[#a63f2d] px-7 text-white shadow-none hover:bg-[#8f3425]">开始写字 <ChevronRight /></Button></div>
            </div>}

            {stage === "write" && <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <button className="back-link" onClick={() => setStage("setup")}><ArrowLeft className="size-3.5" /> 返回</button>
              <div className="mt-6 flex items-end justify-between gap-4"><div><p className="section-kicker">写下第一个字 · 第二步</p><h1 className="mt-3 font-serif text-3xl font-medium tracking-[-0.03em] sm:text-5xl">不要挑，写下最先想到的字。</h1></div><span className="hidden text-xs text-black/40 sm:block">正在寻找：{itemName}</span></div>
              <div className="writing-shell mt-7"><div className="writing-grid" aria-hidden="true" />
                <WritingCanvas strokes={strokes} setStrokes={setStrokes} onFirstStroke={() => setFirstStrokeAt((v) => v ?? new Date())} />
                {strokes.length === 0 && <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><PenLine className="mx-auto size-5 text-black/25" /><p className="mt-3 font-serif text-lg text-black/25">用鼠标、手指或触控笔书写</p></div></div>}
                <div className="absolute top-3 left-3 font-serif text-xs text-black/30">北</div><div className="absolute top-3 right-3 font-serif text-xs text-black/30">东</div><div className="absolute right-3 bottom-3 font-serif text-xs text-black/30">南</div><div className="absolute bottom-3 left-3 font-serif text-xs text-black/30">西</div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-4 text-xs text-black/45"><span>{strokes.length} 笔</span><span>{formatTime(firstStrokeAt)}</span></div><Button variant="ghost" size="sm" onClick={clearWriting} disabled={strokes.length === 0} className="rounded-full text-black/55 hover:bg-black/5"><Eraser /> 擦除重写</Button></div>
              <div className="paper-panel mt-6 p-5"><div className="flex items-start gap-3"><CircleHelp className="mt-0.5 size-4 shrink-0 text-[#a63f2d]" /><div className="flex-1">
                <label htmlFor="recognized-character" className="text-sm font-medium">网页验证版：请填写你刚才写下的字</label><p className="mt-1 text-xs leading-5 text-black/45">正式版将由识字模块自动填写，再由你确认。原始笔迹不会被替换。</p>
                <Input id="recognized-character" value={recognizedCharacter} onChange={(e) => setRecognizedCharacter(Array.from(e.target.value.trim())[0] ?? "")} placeholder="一字" className="mt-4 h-12 w-28 rounded-none border-0 border-b border-black/30 bg-transparent px-0 text-center font-serif text-2xl shadow-none focus-visible:border-black focus-visible:ring-0" />
              </div></div></div>
              <div className="mt-6 flex justify-end"><Button size="lg" disabled={strokes.length === 0 || !recognizedCharacter} onClick={() => setStage("confirm")} className="h-12 rounded-full bg-[#171512] px-7 text-white shadow-none hover:bg-black">核对本次记录 <ChevronRight /></Button></div>
            </div>}

            {stage === "confirm" && <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <button className="back-link" onClick={() => setStage("write")}><ArrowLeft className="size-3.5" /> 返回修改</button>
              <p className="section-kicker mt-6">最终确认 · 第三步</p><h1 className="mt-3 font-serif text-3xl font-medium tracking-[-0.03em] sm:text-5xl">确认以后，本次推演不再改变。</h1>
              <div className="paper-panel mt-8 overflow-hidden"><div className="grid sm:grid-cols-[220px_1fr]">
                <div className="confirm-glyph grid min-h-56 place-items-center border-b border-black/10 sm:border-r sm:border-b-0"><span className="font-serif text-8xl">{recognizedCharacter}</span></div>
                <dl className="divide-y divide-black/10 px-5 sm:px-7">
                  <div className="record-row"><dt>寻找物品</dt><dd>{itemName}</dd></div><div className="record-row"><dt>推演原点</dt><dd>{origin}</dd></div><div className="record-row"><dt>确认文字</dt><dd className="font-serif text-xl">{recognizedCharacter}</dd></div><div className="record-row"><dt>第一笔时间</dt><dd>{formatTime(firstStrokeAt)}</dd></div><div className="record-row"><dt>时区</dt><dd>{timezone}</dd></div><div className="record-row"><dt>规则版本</dt><dd>寻物规则 0.2 · 固定</dd></div>
                </dl>
              </div></div>
              <div className="mt-5 flex flex-wrap gap-3"><Button variant="outline" onClick={() => setStage("write")} className="rounded-full border-black/20 bg-transparent">识别错了</Button><Button variant="ghost" onClick={() => { clearWriting(); setStage("write"); }} className="rounded-full text-black/55 hover:bg-black/5"><Eraser /> 擦除重写</Button></div>
              <label className="mt-8 flex cursor-pointer items-start gap-3 rounded-2xl border border-[#a63f2d]/25 bg-[#a63f2d]/5 p-4 text-sm leading-6"><Checkbox checked={finalConfirmed} onCheckedChange={(v) => setFinalConfirmed(v === true)} className="mt-1 border-[#a63f2d]/50 data-[state=checked]:border-[#a63f2d] data-[state=checked]:bg-[#a63f2d]" /><span>我确认这是我想到该物品时最先确定、并决定提交的字。确认后，笔迹、文字及本次寻物事件将被锁定，不能修改或重新推演。</span></label>
              <div className="mt-6 flex justify-end"><Button size="lg" disabled={!finalConfirmed} onClick={sealRecord} className="h-12 rounded-full bg-[#a63f2d] px-7 text-white shadow-none hover:bg-[#8f3425]"><LockKeyhole /> 确认并封存</Button></div>
            </div>}

            {stage === "sealed" && <div className="grid min-h-[520px] place-items-center text-center animate-in fade-in duration-500"><div><div className="seal-pulse mx-auto grid size-24 place-items-center rounded-full border border-[#a63f2d]/30"><LockKeyhole className="size-8 text-[#a63f2d]" strokeWidth={1.4} /></div><p className="mt-8 font-serif text-3xl">本次记录已封存</p><p className="mt-3 text-sm text-black/45">规则、顺序与后续线索将不再重新计算</p></div></div>}

            {stage === "result" && ruleResult && <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="section-kicker">固定规则推演 · 第四步</p><h1 className="mt-3 font-serif text-3xl font-medium tracking-[-0.03em] sm:text-5xl">从当前最强线索开始找。</h1></div><div className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/50">{itemName} ·「{recognizedCharacter}」</div></div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-black/45"><span className="rounded-full border border-black/10 px-3 py-1.5">原点：{origin}</span><span className="rounded-full border border-black/10 px-3 py-1.5">{ruleResult.ganzhiDay}日 · {ruleResult.hourBranch}时</span><span className="rounded-full border border-black/10 px-3 py-1.5">规则 0.2</span></div>
              <div className="result-card mt-7"><div className="result-card__compass"><CompassMark /></div><div className="result-card__content"><p className="text-xs tracking-[0.16em] text-[#a63f2d] uppercase">{ruleResult.rounds[revealedRound].eyebrow}</p><h2 className="mt-3 font-serif text-3xl leading-tight sm:text-4xl">{ruleResult.rounds[revealedRound].title}</h2><p className="mt-4 max-w-lg text-sm leading-7 text-black/58 sm:text-base">{ruleResult.rounds[revealedRound].body}</p><div className="mt-6 flex flex-wrap gap-2">{ruleResult.rounds[revealedRound].tags.map((tag) => <span key={tag} className="rounded-full border border-black/15 px-3 py-1 text-xs text-black/55">{tag}</span>)}</div></div></div>
              <div className="basis-note mt-4"><span>本轮依据</span><p>{ruleResult.rounds[revealedRound].basis}</p></div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-2" aria-label="线索轮次">{ruleResult.rounds.map((_, index) => <span key={index} className={`round-dot ${index <= revealedRound ? "round-dot--active" : ""}`} />)}</div>{revealedRound < ruleResult.rounds.length - 1 ? <Button size="lg" onClick={() => setRevealedRound((value) => Math.min(value + 1, ruleResult.rounds.length - 1))} className="h-12 rounded-full bg-[#171512] px-7 text-white shadow-none hover:bg-black">这里没有找到 <ChevronRight /></Button> : <Button variant="outline" size="lg" onClick={restart} className="h-12 rounded-full border-black/20 bg-transparent px-7"><RotateCcw /> 结束本次寻物</Button>}</div>
              <div className="mt-8 flex items-start gap-3 border-t border-black/10 pt-5 text-xs leading-6 text-black/45"><AlertTriangle className="mt-1 size-4 shrink-0 text-[#a63f2d]" /><p>结果由固定程序根据真实笔迹触发，不使用随机数或生活概率。它属于传统文化寻物提示，不保证找回，也不能作为指认他人的证据。<a className="ml-1 inline-flex items-center gap-1 text-[#8f3425] underline underline-offset-4" href="https://zh.wikisource.org/zh/欽定古今圖書集成/博物彙編/藝術典/第748卷" target="_blank" rel="noreferrer">查看原始规则 <ExternalLink className="size-3" /></a></p></div>
            </div>}
          </div></section>

          <aside className="hidden border-l border-black/12 pl-7 xl:block"><div className="sticky top-7 pt-4"><p className="text-[10px] font-semibold tracking-[0.2em] text-black/35 uppercase">本次规则</p><div className="mt-5 space-y-5">
            <RuleNote icon={<ShieldCheck />} title="本人亲自寻找" body="不开放代找或替人推演" /><RuleNote icon={<PenLine />} title="形依真实笔迹" body="简体不会暗中转成繁体" /><RuleNote icon={<LockKeyhole />} title="一次计算，分轮揭示" body="反馈不参与重新计算" /><RuleNote icon={<Search />} title="没有依据就停止" body="不根据常识补充位置" />
          </div><div className="mt-8 border-t border-black/10 pt-6 text-xs leading-6 text-black/42"><p>规则引擎：0.2 已固定</p><p>地点存储：不保存</p><p>手写采集：运行中</p><p>第一笔计时：运行中</p></div></div></aside>
        </div>
      </div>
    </main>
  );
}

function RuleNote({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <div className="rule-note">{icon}<div><p>{title}</p><span>{body}</span></div></div>;
}
