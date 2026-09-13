"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "./landing.css";

const foods = ["Dubai chocolate", "Iced coffee", "Birria tacos", "Pastrami sandwich", "Mango ice cream"];
function Store(){return <svg viewBox="0 0 80 70" fill="none" aria-hidden="true"><path d="M14 29V61H66V29M10 29H70L63 11H17Z"/><path d="M10 29Q16 43 22 29Q28 43 34 29Q40 43 46 29Q52 43 58 29Q64 43 70 29M29 61V46H43V61M51 47H60M24 11L22 29M35 11L34 29M45 11L46 29M56 11L58 29"/></svg>}
export default function LandingPage() {
  const [selected, setSelected] = useState(0);
  const [liked, setLiked] = useState<number[]>([]);
  const [party, setParty] = useState(false);
  const [perfectFit, setPerfectFit] = useState(false);
  const partyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (partyTimer.current) clearTimeout(partyTimer.current); }, []);
  const celebrate = () => {
    setParty(false);
    requestAnimationFrame(() => setParty(true));
    if (partyTimer.current) clearTimeout(partyTimer.current);
    partyTimer.current = setTimeout(() => setParty(false), 1600);
  };
  const heart = (index: number) => {
    setSelected(index);
    setLiked((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]);
  };
  return <main className={`buzz-landing visual-story ${party ? "party-mode" : ""}`}>
    <div className="buzz-grain" aria-hidden="true"/>
    <div className="story-layout">
      <div className="trend-cloud" aria-label="Choose a trending food to see its campaign"><div className="flow-caption input-caption"><h2>Catch the craving.</h2></div>
        {foods.map((food,index)=><button key={food} className={`trend-post post-${index} ${selected===index?"active":""} ${liked.includes(index)?"is-liked":""}`} onClick={()=>setSelected(index)} onDoubleClick={()=>heart(index)} aria-label={`Create a campaign for ${food}${liked.includes(index) ? ", liked" : ""}`} aria-pressed={selected===index}>
          <span className="post-profile" aria-hidden="true"><i/><b/><span>•••</span></span>
          <span className="post-art-frame"><span className={`food-art art-${index}`} role="img" aria-label={food}/></span>
          <span className="post-reactions" aria-hidden="true"><span className="post-heart">{liked.includes(index) ? "♥" : "♡"}</span><svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 1-8 8H4l1-5a8 8 0 1 1 15-3Z"/></svg><span>↗</span><svg className="post-save" viewBox="0 0 24 24"><path d="M6 3H18V21L12 16L6 21Z"/></svg></span>
          <span className="post-lines" aria-hidden="true"><i/><i/></span>
          <span className="heart-burst" aria-hidden="true"><i>♥</i><i>♥</i><i>♥</i><i>♥</i><i>♥</i></span>
        </button>)}
        <span className="viral-badge badge-one" aria-hidden="true">♥ <span>↗</span></span><span className="viral-badge badge-two" aria-hidden="true">✳</span>
      </div>
      <div className="story-connector connector-in" aria-hidden="true"><svg viewBox="0 0 220 180"><path d="M0 15C130 15 80 90 210 90M0 90H210M0 165C130 165 80 90 210 90"/><path className="flow-dot" d="M0 90H210"/><path className="connector-arrow" d="M197 80L210 90L197 100"/></svg></div>
      <section className="restaurant-hub" aria-label="Mise-en-vue checks whether a trend fits your restaurant and turns it into a campaign">
        <h1 onDoubleClick={celebrate} title="Try a double-click">mise-en-vue<span>.</span></h1>
        <p className="audience-tagline">Where food trends meet your menu.</p>
        <div className="fit-card" aria-label="Selected dish approved for ingredients, equipment, and margin">
          <span className="fit-card-shadow" aria-hidden="true"/>
          <div className="fit-dish" aria-hidden="true"><span className={`food-art art-${selected}`}/></div>
          <div className="fit-details">
            <span className="fit-title">YOUR KITCHEN</span>
            <div className="fit-checks">
              <span><i>Ingredients</i><b>✓</b></span>
              <span><i>Equipment</i><b>✓</b></span>
              <span><i>Margin</i><b>✓</b></span>
            </div>
          </div>
          <button className="fit-seal" type="button" onClick={() => setPerfectFit((value) => !value)} aria-label={perfectFit ? "Perfect kitchen match" : "Increase kitchen match"} title="Convince the chef"><span>{perfectFit ? "100%" : "92%"}</span><small>{perfectFit ? "chef approved" : "match"}</small></button>
        </div>
        <Link className="hub-enter" href="/workspace" aria-label="Open Mise-en-vue"><span>Your next campaign</span><span aria-hidden="true">↗</span></Link>
      </section>
      <div className="story-connector connector-out" aria-hidden="true"><svg viewBox="0 0 220 180"><path d="M0 90C100 90 80 20 210 20M0 90H210M0 90C100 90 80 160 210 160"/><path className="flow-dot" d="M0 90H210"/><path className="connector-arrow" d="M197 80L210 90L197 100"/></svg></div>
      <div key={selected} className="campaign-suite" aria-label={`Ready-to-share ${foods[selected]} campaign: social post, email, and scheduled promotion`}><div className="flow-caption output-caption"><h2>Make a little noise.</h2></div>
        <div className="campaign-piece email-piece"><div className="email-bar" aria-hidden="true"><span>✉</span><i/><b>✓</b></div><div className="email-content"><Store/><span className={`food-art art-${selected}`}/><div className="email-lines"><i/><i/><i/></div><span className="email-button"/></div></div>
        <div className="campaign-piece social-piece"><div className="campaign-account" aria-hidden="true"><Store/><i/><span>•••</span></div><div className="campaign-poster"><span className="poster-sun" aria-hidden="true">✳</span><span className={`food-art art-${selected}`} role="img" aria-label={foods[selected]}/><div className="poster-seal" aria-hidden="true"><Store/></div><span className="poster-line"/></div><div className="campaign-social-footer" aria-hidden="true">♡ <svg viewBox="0 0 24 24"><path d="M6 3H18V21L12 16L6 21Z"/></svg><b>✓</b></div></div>
        <div className="campaign-piece schedule-piece" aria-hidden="true"><div className="calendar-top"><i/><i/></div><div className="calendar-grid">{Array.from({length:12},(_,i)=><span key={i} className={i===7?"calendar-selected":""}>{i===7?"✓":""}</span>)}</div><span className="send-bubble"><svg viewBox="0 0 30 30"><path d="M3 13L27 3L19 27L13 18ZM13 18L27 3"/></svg></span></div>
        <span className="suite-spark" aria-hidden="true">✧</span>
        <div className="party-confetti" aria-hidden="true">{["✦","●","♥","✳","◆","✦","●","♥","✳","◆","✦","●"].map((shape,index)=><i key={index}>{shape}</i>)}</div>
      </div>
    </div>
  </main>;
}
