/* TODO: Option to disable dead end situations
 *       Option to display the score
 *       Have a look at ivRead 
 *       Handle dwarves after displaying room description
 *       Consider whether dwarves following us to end cave is okay
 *       Implement hints
 *       Verify that dropping the bird in cage works properly on resu 
 *       Check item placement on deaths after falls
 *       Figure out why the game keeps saying "The grate is locked" in end room */
(function colossalCave(document) {
  var g = {}; /* game state */
  var H = {}; /* helper state */
  var S = {}; /* settings state */
  var T = {}; /* temporary settings state */
  const dAltLoc = 18;
  const gameBits = 63; /* expected value of gameReady with all bitflags on */
  const versionTag = 1.0;
  var gKeys = [];
  var itemKeys = [];
  var msgList = []; /* messages not associated with rooms or objects */
  var itemList = {}; /* JS doesn't have associative arrays, so we fake one */
  var wordList = {};
  var shortWordList = {};
  var locList = []; /* every room in the game */
  var commandList = []; /* list of previous text parser inputs */
  var demoActions = [];
  var optList = [];
  var optIndices = {};
  var gameReady = 0;
  var gameStarter;
  var stopGame = 0;
  var timerMode = 0;
  var actMsg = [];
  var ccText = document.getElementById("cctext");
  var ccInput = document.getElementById("ccinput");
  var ccParser = document.getElementById("ccparser");
  var ccMobAdjuster = document.querySelector(".mobileAdjuster");
  var ccCursor = document.getElementById("ccCursor");
  var ccSizer = document.getElementById("ccinvisible");
  var ccTimer = document.getElementById("cctimer");
  var ccSettings = document.querySelector(".settings");
  var ccAnyKey = document.getElementById("ccanykey");
  var textInput = "";
  var expectInput = 0; /* 0: inactive; 1: actions; 2: yes; 3: anykey; 4: numeric */
  var demoMode = 0;
  var word1 = "";
  var word2 = "";
  var verb = 0; /* this is a number */
  var object = 0; /* this defaults to string in the JS port, but can be a number */
  var object1 = 0; /* used in a couple spots in code for intransitive verbs */
  var motion = 0;
  var dbugFlg = 0;
  var itemCount = 0; /* tiny optimization of repeated calls to itemKeys.length */
  var roomCount = 0; /* ditto locations */
  var travel;
  var yesHandler; /* callback function for multi-line input, notably used by yes() */
  var cursorPos = 1;
  var initState = 0;
  var pfFlags = 0;
  var hasLocalStorage = false;
  var unsavedSettings = false;
  var timedFromStart = false;
  var currentTick = 0;
  var demoAlert = false;
  var saveFlg = 0;
  var lastSaveTurn = 0;
  var oldExpectInput = 0;
  var lineWidth = 72;
  var linePos = 0;
  var flushTimer = 0;
  var newLineReady = false; /* hack for tracking newlines */
  var weirdBreaksMode = 0; /* another newline-related hack */
  var maxPit = 72; /* you guessed it, newline hack */
  var assumeMobileMode = 0;
  var wTracker = { oldX: 0, oldY: 0, x: 0, y: 0, minX: 0, minY: 0, maxY: 0, lastPaddingY: 0 };
  var windowXSizeHistory = [];
  var windowYSizeHistory = new Set();
  var marginHackHistory = new Set();
  var assumeProblemBrowser = !!(navigator.userAgent.match(/(?=.*(FxiOS|Firefox)\/\d+)(?=.*Mobile)/g)); /* urgh */
  const helper = "adventHelper";
  const setter = "adventSettings";
  const mTgts = {nowhere: 21, back: 8, look: 57, cave: 67, entrance: 64, depression: 63};
  const DWARFMAX = 6;
  const OBJ_LIMIT = 100; /* divisor for travel conditions, also upper limit for number of items */
  const magicWords = [62,65,71];
  const LIGHT = 1,
    WATOIL = 2,
    LIQUID = 4,
    NOPIRAT = 8,
    HINTC = 16,
    HINTB = 32,
    HINTS = 64,
    HINTM = 128,
    HINT = 240; /* hints are presently unimplemented */
  const MOTION = 0, NOUN = 1, VERB = 2, OTHER = 3;
  const CL_ALIGN = 1, /* left-of-center align */
    NO_NEWLINE = 2; /* tells printf to never force newlines */

/* Browsers try to move cursor to the beginning or end of the
   input field when Up/Down are pressed. Overriding this is
   simpler than disabling it */
  var cursorMaintainer = function() {
    if (!ccInput.value) return;
    let truePos = ccInput.value.length + cursorPos;
    function dumpCursorAt(pos) {
      if (ccInput.setSelectionRange) {
        ccInput.focus();
        ccInput.setSelectionRange(pos, pos);
        ccInput.click();
      }
      /* we could do compatibility stuff here, but this game won't 
         run on old browsers anyway */
    }
    dumpCursorAt(truePos - 1);
    /* browsers try to be sneaky */
    var doubleCheck = (function() {
      setTimeout(function() {
        if ((ccInput.value.length + cursorPos) == truePos) 
        dumpCursorAt(truePos - 1);
      }, 1)})();
  };
  var lineBacker = (function() {
    var current = -1;
    return function(key = 0) {
      if (!key) { current = -1; return; }
      let doUpdate = false;
      switch (key) {
        case 'ArrowUp': {
          if (current < commandList.length - 1) {
            current++;
            doUpdate = true;
          }
          else /* else browsers try to move the cursor position */
          cursorMaintainer(); 
          break;
        } 
        case 'ArrowDown': {
          if (current >= 0) {
            current--;
            doUpdate = true;
          }
          else /* else browsers try to move the cursor position */
          cursorMaintainer();
          break;
        } 
        case 'PageUp': {
          current = commandList.length - 1;
          doUpdate = true;
          break;
        }
        case 'PageDown': {
          current = 0;
          doUpdate = true;
          break;
        }
        case 'Escape': {
          current = -1;
          doUpdate = true;
          break;
        } 
        default: {
          current = -1;
          break;
        }
      }
      if (!doUpdate) return;
      if (!commandList.length) return;
      setAllParsers((current == -1) ? "" : commandList[commandList.length - 1 - current]);
      cursorMove('End');
    };
  })();

  /* Megahack for mobile environments */
  function toggleMargin(hasMargin) {
    if (hasMargin) ccMobAdjuster.classList.remove("nomargin");
    else ccMobAdjuster.classList.add("nomargin");
  }

  function trackWindowSize() {
    if (!wTracker.x) {
      wTracker.x = window.innerWidth;
      wTracker.y = window.innerHeight;
      wTracker.minX = wTracker.x;
      wTracker.minY = wTracker.y;
      wTracker.maxY = wTracker.y;
    }
    wTracker.oldX = wTracker.x;
    wTracker.oldY = wTracker.y;
    wTracker.x = window.innerWidth;
    wTracker.y = window.innerHeight;
    if (wTracker.x < wTracker.minX) wTracker.minX = wTracker.x;
    if (wTracker.y < wTracker.minY) wTracker.minY = wTracker.y;
    if (wTracker.y > wTracker.maxY) wTracker.maxY = wTracker.y;
    if ((!assumeMobileMode) && (wTracker.x < 600)) assumeMobileMode++;
    if (!windowXSizeHistory.includes(wTracker.x)) {
      windowXSizeHistory.push(wTracker.x);
      if ((windowXSizeHistory.length > 2) && (Math.max(...windowXSizeHistory) >= 600)) assumeMobileMode -= 3;
    }
    windowYSizeHistory.add(wTracker.y);
    if ((assumeMobileMode > 0) && (wTracker.oldX == wTracker.x)) {
      let diff = wTracker.oldY - wTracker.y;
      while (S.problemBrowser != assumeProblemBrowser) {
        let abs = Math.abs(diff);
        if ((abs >= 20) && (abs <= 120)) {
          if (!marginHackHistory.has(abs)) {
            marginHackHistory.add(abs);
            document.documentElement.style.setProperty("--address-bar-adjuster", abs + "px");
          }
        }
        toggleMargin(1);
        if ((wTracker.y == wTracker.maxY) && (windowYSizeHistory.size > 3)) toggleMargin(0);
        else if ((wTracker.y != wTracker.minY) && (marginHackHistory.has(wTracker.y - wTracker.minY))) toggleMargin(0);
        break;
      }
    }
  }

  function cls() {
    ccText.innerHTML = "";
  }

  function sizeCalc() {
    /* First priority: Try to have exactly 72 columns if reasonable (minimum font size 19px)
     * Second priority: Try to have at least 40 columns (minimum font size 19px)
     * Third priority: Try to have at least 40 columns at any font size
     * Fourth priority: If 72 columns, see if we can have 25 rows */
    let playArea = document.getElementById("playarea");
    function sizeIt(a) {
      let px = (a * 16).toFixed(2);
      document.documentElement.style.setProperty("--cc-font-size", px + "px");
    }
    sizeIt(1);
    ccSizer.style.display = "inline-block";
    let wid = () => ccSizer.clientWidth;
    let hgt = () => ccSizer.clientHeight;
    let tgtWid = playArea.clientWidth * 0.99;
    let tgtHgt = window.innerHeight * 0.99;
    let sizerStyle = +(getComputedStyle(ccSizer).getPropertyValue("font-size").slice(0, -2));
    let tgtLineWidth = 72;
    let fsAdjuster72 = tgtWid / (wid() * 1.8);
    let canHas19px = ((sizerStyle * fsAdjuster72) >= 19);
    if (!canHas19px) {
      let srslyCanHas19px = ((sizerStyle * fsAdjuster72) >= (95 / 9));
      if (srslyCanHas19px) {
        tgtLineWidth = Math.floor(72 * sizerStyle / 19 * fsAdjuster72);
        if (tgtLineWidth < 40) tgtLineWidth = 40;
      }
      else tgtLineWidth = 40;
      let simpleTestAdjuster = fsAdjuster72 * 72 / tgtLineWidth;
      sizeIt(simpleTestAdjuster);
      let tstWid = ((tgtLineWidth == 40) ? tgtWid : (tgtWid * 40 / tgtLineWidth)) / 0.992;
/*    console.log(wid());
      console.log(tstWid); */
      while (wid() > tstWid) { /* paranoia */
        simpleTestAdjuster *= 0.995;
        sizeIt(simpleTestAdjuster);
      }
    }
    else { /* 72 columns with a minimum font size of 19px */
      let simpleTestAdjuster = 19 / sizerStyle;
      sizeIt(simpleTestAdjuster);
      let lines = tgtHgt / hgt() * 10;
      if (lines > 25) {
        simpleTestAdjuster *= (lines / 25);
      }
      sizeIt(simpleTestAdjuster);
      if (dbugFlg) console.log(`${wid()} ${tgtWid / 1.786} ${lines}`);
      while (wid() > tgtWid / 1.786) { /* paranoia */
        simpleTestAdjuster *= 0.995;
        sizeIt(simpleTestAdjuster);
      }
    }
/*  console.log(tgtLineWidth);
    console.log(+(getComputedStyle(ccSizer).getPropertyValue("font-size").slice(0, -2))); */
    document.documentElement.style.setProperty("--fake-width", wid().toFixed(2) + "px");
    document.documentElement.style.setProperty("--clalign-table-width", (wid() / 40 * alignWidth(tgtLineWidth)).toFixed(2) + "px");
    ccSizer.style.display = "none";
    if (lineWidth != tgtLineWidth) {
      /* I tried to do this in a thousand less horrible ways
       * Why does web development have to suck 
       * Give me style containers in CSS */
      let loytty = false;
      for (let sheet of document.styleSheets) {
        if (loytty) break;
        for (let rule of sheet.cssRules) {
          if (!rule.selectorText) continue;
          if (rule.selectorText.includes(".linebreak[data-minpit")) {
            let which = +(numify(rule.selectorText));
            loytty = true;
            if ((which <= lineWidth) == (which <= tgtLineWidth)) continue;
            if (which <= tgtLineWidth) {
              rule.style.setProperty("display", "block");
            }
            else rule.style.setProperty("display", "none");
          }
          else if (rule.selectorText.includes(".linebreak[data-maxpit")) {
            let which = +(numify(rule.selectorText));
            loytty = true;
            if ((which > lineWidth) == (which > tgtLineWidth)) continue;
            if (which > tgtLineWidth) {
              rule.style.setProperty("display", "block");
            }
            else rule.style.setProperty("display", "none");
          }
          else if (rule.selectorText.includes(".rsp-space[data-maxpit")) {
            let which = +(numify(rule.selectorText));
            loytty = true;
            if (which == 55) continue; /* always breaks */
            if ((which > lineWidth) == (which > tgtLineWidth)) continue;
            if (which > tgtLineWidth) {
              rule.style.setProperty("display", "inline", undefined);
            }
            else rule.style.setProperty("display", "none", "important");
          }
          else if (rule.selectorText.includes(".rsp-space[data-minpit")) {
            let which = +(numify(rule.selectorText));
            loytty = true;
            if (which == 55) continue; /* always breaks */
            if ((which < lineWidth) == (which < tgtLineWidth)) continue;
            if (which < tgtLineWidth) {
              rule.style.setProperty("display", "inline", undefined);
            }
            else rule.style.setProperty("display", "none", "important");
          }
          else if (rule.selectorText.includes(".cc-appear")) {
            loytty = true;
            let odd = rule.selectorText.includes("-odd") ? true : false;
            let odd2 = (alignWidth(tgtLineWidth) % 2) ? true : false;
            if (odd == odd2) {
              rule.style.setProperty("display", "inline", undefined);
            }
            else rule.style.setProperty("display", "none", "important");
          }
        }
      } 
      lineWidth = tgtLineWidth;
    }
    document.documentElement.style.setProperty("--align-width", alignWidth());
    if (dbugFlg) {
      currentTick = 19; /* big phony */
      updateTick();
    }
    trackWindowSize();
    if (assumeMobileMode > 0) scroll();
  }

  function wipe(a) {
    a = {};
  }

  function isVerb(a) {
    return (wordType(a) == VERB);
  }

  function isNoun(a) {
    return (wordType(a) == NOUN);
  }

  function isMotion(a) {
    return (wordType(a) == MOTION);
  }

  function objectify(a) {
    return ((typeof(a) === 'number') && (a > 0) && (a < itemCount)) ? itemKeys[a] : a;
  }

  function oOk(a) {
    return Boolean(itemList[a]);
  }

  function objectSet(a) {
    object = objectify(a);
  }

  function oidx(a) {
    if (typeof(a) === 'object') return a.index || -2;
    return ((typeof(a) === 'number') ? a : itemList[a].index);
  }
  /* Helper for moving objects to a fixed location */
  function bumpid(a) {
    return oidx(a) + itemCount;
  }

  function isTreasure(a) {
    if (typeof(a) != 'string') a = objectify(a);
    if (!oOk(a)) return false;
    return !!(itemList[a].score);
  }

  function propSet(a, b) {
    a = objectify(a);
    if (oOk(a)) itemList[a].status = b;
  }

  function propPut(a, b, c) {
    propSet(a, put(a, b, c));
  }

  function prop(a) {
    a = objectify(a);
    if (oOk(a)) return itemList[a].status;
    return -2;
  }

  function fixedSet(a, b) {
    a = objectify(a);
    if (oOk(a)) itemList[a].floc = b;
  }

  function fixed(a) {
    a = objectify(a);
    if (oOk(a)) return itemList[a].floc;
    return -2;
  }

  function stateSet(a, b, c) {
    if (b != null) propSet(a, b);
    if (c != null) fixedSet(a, c);
  }

  function placeSet(a, b) {
    a = objectify(a);
    if (oOk(a)) itemList[a].loc = b;
  }

  function place(a) {
    a = objectify(a);
    if (oOk(a)) return itemList[a].loc;
    return -2;
  }

  function rand(i) {
    return Math.floor(Math.random() * i);
  }

  function one_in_(i) {
    return (rand(i) == 0);
  }

  function odd(text) {
    if (typeof text === 'number') return (Math.round(text) % 2) ? true : false;
    return (text && (text.length % 2)) ? true : false;
  }

  function panic() {
    if (!g.panic)
      g.clock2 = 15;
    g.panic = 1;
  }
  /* Return true x per cent of the time */
  function pct(x) {
    return rand(100) < x;
  }
  /* Return true x per mille of the time */
  function pml(x) {
    return rand(1000) < x;
  }
  /* Returns target line width for left-of-center alignments */
  function alignWidth(l = lineWidth) {
    return Math.min(55, l);
  }
  /* Responsive line break (urgh) */
  function addResponsiveLineBreak(e, f = ccText) {
    let b = document.createElement("br");
    b.classList.add("linebreak");
    if (!e) b.setAttribute("data-minpit", maxPit); 
    else b.setAttribute("data-maxpit", e);
    f.appendChild(b);
    if (!e) f.innerHTML += " ";
  }
  /* Responsive line space */
  function addResponsiveSpace(e, f = ccText, odd, anti = false) {
    if (!e) return;
    let s = document.createElement("span");
    s.classList.add("rsp-space");
    if (odd !== 'undefined') {
      s.classList.add(odd ? "cc-appear-even" : "cc-appear-odd");   
    }
    s.setAttribute(anti ? "data-minpit" : "data-maxpit", e);
    s.innerHTML += "\u00a0";
    f.appendChild(s);
  }
  function addOddlyResponsiveSpace(f = ccText, appearOnEven) {
    let s = document.createElement("span");
    s.classList.add(appearOnEven ? "cc-appear-even" : "cc-appear-odd");
    s.innerHTML += "\u00a0";
    f.appendChild(s);
  }
  /* this formatter is a lot of things, but it isn't false advertising */
  function uglyFormat() {
    var args = arguments;
    var n = 1;
    if (!args[0]) return "";
    if ((typeof args[0]) !== 'string') return "";
    let longSpaceMatcher = /\s|&nbsp(?!;)|\\u00a0|&nbsp;/g;
    /* don't ask me what the {3,6,} is doing, as long as it makes the regex
       work I am not complaining */
    return args[0].replace(/^<l>/, function() {
      pfFlags |= CL_ALIGN;
      return "";
    }).replace(/((?<!%{3,6,})%([%a-z]|-?\d+s))|(\n)|^((?:\s|&nbsp(?!;)|\\u00a0|&nbsp;)+)|((?:\s|&nbsp(?!;)|\\u00a0|&nbsp;){2,})/g, function(m, p1, p2, p3, p4, p5) {
      if (p1 && (m.charAt(1) == '%')) return "%";
      if (p2 && p2.length > 1) {
        let leftAlign = (p2.charAt(0) == '-');
        let arg = String(args[n++]);
        let len = p2.match(/\d+/);
        let pit = len - arg.length;
        if (pit <= 0) return arg.slice(0, len);
        let pad = "\u00a0".repeat(pit - 1) + " ";
        let pos = arguments[arguments.length - 2];
        let s = arguments[arguments.length - 1];
        if ((pos + m.length) >= s.length) pfFlags |= NO_NEWLINE;
        if (leftAlign) return arg + pad;
        else return pad + arg;
      }
      if (p3) return "<br>";
      let spaceCounter = 0;
      /* um, maybe I should have just used white-space: pre;? */ 
      if (p4 || p5) {
        let pP = (p4 || p5);
        return pP.replace(longSpaceMatcher, function(m, p1) {
          spaceCounter++;
          if (spaceCounter == 2) return " ";
          return "\u00a0";
        });
      }
      if ((typeof args[n]) === 'string') return uglyFormat(args[n++]);
      return args[n++];
    })/*.replace(/^<l>/, function(m, p1, str) {
      let len = str.replace(/(<br>)|^(<l>)/g, "").length;
      let pit = Math.floor(alignWidth() - len + 0.2) / 2;
      pfFlags |= CL_ALIGN;
      if (pit < 1) return "";
      return "\u00a0".repeat(pit);
    })*/;
  }
  /* This would be so much simpler without variable line lengths 
   * (a problem that original Colossal Cave didn't have)
   * Most of this code is spent tackling that 
   * Weird breaks mode 2 means that newlines are avoided except in special situations */
  function printf(...args) {
    pfFlags = 0;
    let newText = uglyFormat(...args);
    let tgt = ((weirdBreaksMode >= 3) ? ccAnyKey : ccText);
    let pit, lineStart = 0, broken = false;
    let forceNewLine = ((!(pfFlags & NO_NEWLINE)) && (/\s($|<br>$)/.test(newText)));
    let startNewLine = /^\s|^(\u00a0)|^(\\u00a0)/.test(newText);
    let brRemoved = false, spaceRemoved = false;
    if (weirdBreaksMode >= 3) weirdBreaksMode -= 3;
    function newLine() {
      tgt.innerHTML += "<br>";
      if (weirdBreaksMode == 2) weirdBreaksMode--;
      maxPit = 72;
    }
    if (((startNewLine) || (!(len()))) && (!(pfFlags & CL_ALIGN)) && (!newLineReady)) {
      newLine();
    }
    function len() {
      pit = newText.replace(/(<br>)|(\s$)/g, "").length;
      return pit;
    }
    function brRemove(bk = true) {
      if (!brRemoved) brRemoved = newText.match(/<br>$/) ? pit : 0;
      newText = newText.replace(/(<br>)|(\s$)/g, bk ? "" : " ");
    }
    if ((weirdBreaksMode == 2) && (!(pfFlags & CL_ALIGN)) && (!startNewLine) && (len() > 40)) {
      brRemove(false);
    }
    if ((startNewLine) && (!(pfFlags & CL_ALIGN))) {
      let verifyLineStart, spaceFinder = /[^.]\s((\s)|(\u00a0)|(\\u00a0)){2,}\b/g;
      while ((verifyLineStart = spaceFinder.exec(newText)) !== null) {
        lineStart = verifyLineStart.index + verifyLineStart[0].length;
      }
    }
    if (pfFlags & CL_ALIGN) linePos = 100;
    while ((weirdBreaksMode) && (((linePos + len()) > lineWidth) || (lineStart > 0))) {
      linePos = 0;
      if (!broken) {
        brRemove();
        broken = true;
        if (weirdBreaksMode == 1) weirdBreaksMode = 2;
      }
      if ((pfFlags & CL_ALIGN) || (startNewLine)) {
        maxPit = 72;
        if (lineStart) {
          let cell0 = document.createElement("div");
          cell0.style.display = "table";
          let cell1 = document.createElement("div");
          cell1.style.display = "table-cell";
          cell1.style.whiteSpace = "pre";
          cell1.innerHTML = newText.slice(0, lineStart);
          cell0.appendChild(cell1);
          let cell2 = document.createElement("div");
          cell2.style.display = "table-cell";
          cell2.innerHTML = newText.slice(lineStart);
          cell0.appendChild(cell2);
          tgt.appendChild(cell0);
          newText = "";
        }
        else {
          let splitPoint = -1, splitIsSpace = false;
          if ((len() > lineWidth) || ((pfFlags & CL_ALIGN) && (pit > 40))) {
            for (let i = Math.min(pit - 1, lineWidth); ((i > 0) && ((splitPoint < 0) || (i > Math.ceil(alignWidth() / 2) + 1))); i--) {
              if (/\s|(\u00a0)|(\\u00a0)|-/.test(newText.charAt(i))) {
                splitPoint = i;
                splitIsSpace = /\s|(\u00a0)|(\\u00a0)/.test(newText.charAt(i));
                if (!(pfFlags & CL_ALIGN)) break;
              }
            }
          }
          if (pfFlags & CL_ALIGN) {
            let table = document.createElement("div");
            table.style.display = "table";
            let alignedTxt = document.createElement("div");
            table.setAttribute("data-alwid", alignWidth());
            table.classList.add("clalign-helper");
            alignedTxt.style.display = "table-cell";
            alignedTxt.style.whiteSpace = "pre";
            alignedTxt.classList.add("center");
            newText = newText.replace(/^(\s|(\u00a0)|(\\u00a0))+/i, "");
            if (splitPoint < 0) {
              alignedTxt.innerHTML = newText;
              addOddlyResponsiveSpace(alignedTxt, odd(newText));
            }
            else {
              let fullLengthIsOdd = odd(newText);
              let line1 = newText.slice(0, splitPoint + 1);
              let lineIsOdd = odd(line1);
              addResponsiveSpace(Math.min(55, pit), alignedTxt, lineIsOdd);
              alignedTxt.innerHTML += line1;
              if (pit <= 55) addResponsiveLineBreak(pit, alignedTxt);
              else alignedTxt.innerHTML += "<br>";
              let line2 = newText.slice(splitPoint + 1);
              lineIsOdd = odd(line2);
              alignedTxt.innerHTML += line2;
              let ntIsOdd = odd(newText);
              if ((pit > 55) || (ntIsOdd == lineIsOdd)) {
                addOddlyResponsiveSpace(alignedTxt, lineIsOdd);
              }
              else {
                addResponsiveSpace(pit, alignedTxt, lineIsOdd);
                addResponsiveSpace(pit - 1, alignedTxt, odd(newText), true);
              }
            }
            table.appendChild(alignedTxt);
            tgt.appendChild(table);
            newText = "";
          }
        }
      }
      else break;
      lineStart = -1;
    }
    newLineReady = newText.match(/<br>$/);
    let customNewLine = false;
    if (newLineReady) {
      if ((weirdBreaksMode == 1) && (!((pfFlags & CL_ALIGN) || startNewLine)) && (pit > 40)) {
        newText = newText.slice(0, -4);
        customNewLine = true;
      }
    }
    else if (lineStart) newLineReady = true;
    console.log(`${newText} ${newLineReady} ${customNewLine} ${brRemoved} ${broken} ${forceNewLine} ${weirdBreaksMode}`);
    tgt.innerHTML += newText;
    if (broken) {
      if ((pfFlags & CL_ALIGN) || (forceNewLine)) {
        if (!newLineReady) tgt.innerHTML += "<br>";
        newLineReady = true;
        linePos = 0;
      }
      else {
        /* tgt.innerHTML += " "; */
        linePos = 0;
      }
    }
    function setMaxPit(comp = 72) {
      comp = Math.min(comp, 72); /* paranoia */
      maxPit = (maxPit == 72) ? Math.min(pit, maxPit) : Math.max(pit, maxPit);
    }
    if (customNewLine) {
      setMaxPit(pit);
    }
    else if ((brRemoved) && (!newLineReady)) {
      setMaxPit(brRemoved);
    }
    else maxPit = 72;
  }

  function Location(long, brief, travel, cond) {
    this.longDesc = long.slice();
    this.briefDesc = brief.slice();
    this.travelList = [];
    let k = -1;
    for (let j of travel) {
      this.travelList[++k] = {};
      this.travelList[k].tdest = j[0];
      this.travelList[k].tverb = j[1];
      this.travelList[k].tcond = j[2];
    }
    this.cond = cond;
    this.visited = 0;
  }

  function lcond(a, which) {
    return (locList[a].cond & which);
  }

  function gameError() {
    if (gameReady >= 0) gameReady -= 256;
  }

  function iniGameState() {
    wipe(g);
    g.newLoc = 1;
    g.loc = 3;
    g.oldLoc = 3;
    g.oldLoc2 = 3;
    g.knfLoc = 0; /* knives aren't real objects, so they need special code */
    g.limit = 330;
    g.tally = 15;
    g.tally2 = 0;
    g.wzDark = 0;
    g.closed = 0;
    g.closing = 0;
    g.clock1 = 30;
    g.clock2 = 50;
    g.holding = 0;
    g.detail = 0;
    g.chLoc = 114;
    g.chLoc2 = 140;
    g.dLoc = [19, 27, 33, 44, 64, 114]; /* last one is pirate, should match chLoc */
    g.odLoc = [0, 0, 0, 0, 0, 0];
    g.dSeen = [0, 0, 0, 0, 0, 0];
    g.dKill = 0;
    g.turns = 0;
    g.panic = 0;
    g.bonus = 0;
    g.numDie = 0;
    g.gaveUp = 0;
    g.magicLearned = 0;
    g.lmWarn = 0;
    g.foobar = 0;
    g.dFlag = 0;
    g.hints = 0;
    g.modifications = 0;
    g.gameId = 0;
    saveFlg = 0; /* paranoia */
    lastSaveTurn = 0;
  }
  function iniSettings() {
    wipe(S);
    wipe(H);
    wipe(T);
    H.highestSave = 0;
    H.gameId = 0;
    /* S and T are initialized through iniOptions */
  }
  async function iniActMsg() {
    try {
      var tulos = await fetch("json/actmsg.json");
      var data = await tulos.json();
      if (!tulos.ok) {
        console.log(data.description);
        return;
      }
      actMsg = data;
    } catch (error) {
      console.error('Error:', error);
    }
  }
  async function iniWordList() {
    gameReady &= ~4;
    try {
      var tulos = await fetch("json/vocab.json");
      var data = await tulos.json();
      if (!tulos.ok) {
        gameError();
        console.log(data.description);
        return;
      }
      wordList = data;
      /* initialize short word list */
      for (let x in wordList) {
        if (x.length > 5) shortWordList[x.slice(0, 5)] = x;
      }
      gameReady |= 4;
    } catch (error) {
      gameReady &= ~4;
      gameError();
      console.error('Error:', error);
    }
  }
  async function iniItems() {
    var itemsReady = 0;
    gameReady &= ~2;
    try {
      var tulos = await fetch("json/itemlist.json");
      var data = await tulos.json();
      if (!tulos.ok) {
        gameError();
        console.log(data.description);
        return;
      }
      var tempKeys = Object.keys(data);
      var noError = true;
      tempKeys.forEach((a) => {
        if (!data[a].index) noError = false;
        itemKeys[data[a].index] = a;
      });
      if (noError) {
        itemList = data;
        if (!itemList.init) {
          itemList.init = true;
          itemList.forEachTreasure = function(a) {
            itemKeys.forEach((b) => {
              if (!itemList[b].score) return;
              (a(itemList[b]));
            });
          };
          itemList.forEach = function(a) {
            itemKeys.forEach((b) => {
              (a(itemList[b]));
            });
          }
          itemList.forEachName = function(a) {
            itemKeys.forEach((b) => {
              (a(b));
            });
          }
        }
        itemCount = itemKeys.length; 
        itemsReady |= 1;
      }
    } catch (error) {
      gameError();
      console.error('Error:', error);
    }
    try {
      if ((gameReady < 0) || !(itemsReady & 1)) return;
      var tulos = await fetch("json/advent3.json");
      var data = await tulos.json();
      if (!tulos.ok) {
        gameError();
        console.log(data.description);
        return;
      }
      let k = Math.min(itemCount, data.length);
      for (let i = 0; i < k; i++) {
        if ((data[i].length) && (itemKeys[i + 1])) {
          itemList[itemKeys[i + 1]].messages = data[i].slice();
        }
      }
      gameReady |= 2;
    } catch (error) {
      gameError();
      console.error('Error:', error);
    }
  }
  async function iniMsgs() {
    gameReady &= ~8;
    try {
      var tulos = await fetch("json/advent4.json");
      var data = await tulos.json();
      if (!tulos.ok) {
        gameError();
        console.log(data.description);
        return;
      }
      gameReady |= 8;
      msgList = data;
    } catch (error) {
      gameReady &= ~8;
      gameError();
      console.error('Error:', error);
    }
  }
  async function iniOptions() {
    gameReady &= ~32;
    try {
      var tulos = await fetch("json/options.json");
      var data = await tulos.json();
      if (!tulos.ok) {
        gameError();
        console.log(data.description);
        return;
      }
      optList = data;
      wipe(optIndices);
      gameReady |= 32;
      var ccForm = document.getElementById("ccinputform");
      var ccFTbl = document.createElement("table");
      ccForm.addEventListener("change", function(e) {
        settingsReacter(e);        
      });
      function tagMobility(el, status = 0) {
        if (status) el.classList.add(status == 1 ? "nomobile" : "onlymobile");
      }
      function numOptListener(e) {
        ctx = e.target;
        if (ctx.type != "number") return;
        k = ctx.value;
        function makeIt(what) {
          /* JS is unfathomably fun
           * We need to update the value property to keep the display accurate
           * We need to update the value attribute to keep the actual value accurate */
          ctx.value = what;
          ctx.setAttribute("value", what);
          ctx.oneDigit = (what < 10);
          settingsReacter({"target": ctx});
        }
        let pit = (typeof(k) == "string") ? k.length : k.toString().length;
        if ((pit < 1) && (e.type == "input") && (ctx.oneDigit)) makeIt(0);
        else if ((!k) || (k < 0) || (k != +k)) makeIt(S[ctx.id]);
        else if (pit > 3) makeIt(999);
        else if ((pit > 1) && (+k < 10)) makeIt(+k); /* leading zeroes */
        else ctx.oneDigit = (pit < 2);
      }
      ["contextmenu","drop","input","keydown","keyup","mousedown","mouseup","select"].forEach((a) => {
        ccForm.addEventListener(a, function(e) {
          if (e.target.type == "number") numOptListener(e);
        });
      });
      for (let o of optList) {
        /* the visual implementation really should be 2 columns, 
         * one for values and one for labels, but I'm lazy */
        var tr = document.createElement("tr");
        tagMobility(tr, o.nomobile);
        var td1 = document.createElement("td");
        var td2 = document.createElement("td");
        var el = document.createElement("input");
        el.setAttribute("type", o.type);
        el.setAttribute("id", o.name);
        switch (o.type) {
          case "checkbox": 
            if (o.default != 0) el.setAttribute("checked", "true"); 
            break;
          case "number": {
            el.setAttribute("value", o.default);
            el.setAttribute("size", 3);
            break;
          }
        }
        var lb = document.createElement("label");
        lb.setAttribute("for", o.name);
        lb.setAttribute("title", o.tooltip);
        if (o.type == "number") {
          tr.classList.add("cc-numrow");
          tr.classList.add("clearfix");
        }
        else tr.classList.add("cc-cbrow");
        lb.innerText = o.shortDesc;
        td1.appendChild(el);
        td2.appendChild(lb);
        tr.appendChild(td1);
        tr.appendChild(td2);
        ccFTbl.appendChild(tr);
        /* initialize settings */
        T[o.name] = o.default;
        optIndices[o.name] = o.index;
      }
      ccForm.appendChild(ccFTbl);
      let buttonRow = document.createElement("div");
      buttonRow.classList.add("buttonrow");
      function appendCCFormButton(which) {
        var b = document.createElement("input");
        b.setAttribute("id", "ccbutton-" + which);
        b.setAttribute("type", "button");
        b.value = which;
        buttonRow.appendChild(b);  
      }
      ["Defaults","Cancel","Apply"].forEach((a) => { 
        appendCCFormButton(a);
      });
      ccForm.appendChild(buttonRow);
      checkLocalStorage(true);
    } catch (error) {
      gameReady &= ~32;
      gameError();
      console.error('Error:', error);
    }
  }
  async function iniDemo() {
    demoMode = 0;
    try {
      var tulos = await fetch("json/demo.json");
      var data = await tulos.json();
      if (!tulos.ok) {
        console.log(data.description);
        return;
      }
      demoActions = data;
      startDemo();
    } catch (error) {
      printf("Error initializing demo\n");
      demoMode = 0;
      stopGame = 0;
      console.error('Error:', error);
    }
  }
  async function iniLocs() {
    var longDesc = [],
      briefDesc = [],
      travelList = [],
      condList = [],
      locsReady = 0,
      locsError = 0;
    gameReady &= ~1;
    (async function longReady() {
      try {
        var tulos = await fetch("json/advent1.json");
        longDesc = await tulos.json();
        if (!tulos.ok) {
          locsError |= 1;
          gameError();
          console.log(data.description);
          return;
        } else {
          locsReady |= 1;
          if (locsReady == 15) prepareLocs();
        }
      } catch (error) {
        locsError |= 1;
        console.error('Error:', error);
      }
    })();
    (async function briefReady() {
      try {
        var tulos = await fetch("json/advent2.json");
        briefDesc = await tulos.json();
        if (!tulos.ok) {
          locsError |= 2;
          gameError();
          console.log(data.description);
          return;
        } else {
          locsReady |= 2;
          if (locsReady == 15) prepareLocs();
        }
      } catch (error) {
        locsError |= 2;
        console.error('Error:', error);
      }
    })();
    (async function travelReady() {
      try {
        var tulos = await fetch("json/travel.json");
        travelList = await tulos.json();
        if (!tulos.ok) {
          locsError |= 4;
          gameError();
          console.log(data.description);
          return;
        } else {
          locsReady |= 4;
          if (locsReady == 15) prepareLocs();
        }
      } catch (error) {
        locsError |= 4;
        console.error('Error:', error);
      }
    })();
    (async function condReady() {
      try {
        var tulos = await fetch("json/loc_cond.json");
        condList = await tulos.json();
        if (!tulos.ok) {
          locsError |= 8;
          gameError();
          console.log(data.description);
          return;
        } else {
          locsReady |= 8;
          if (locsReady == 15) prepareLocs();
        }
      } catch (error) {
        locsError |= 8;
        console.error('Error:', error);
      }
    })();
    if (locsError) {
      gameError();
      return;
    }

    function prepareLocs() {
      if (gameReady & 1) return;
      locList[0] = {}; /* dummy such that loc 0 can mean nowhere */
      console.log(longDesc.length);
      console.log(briefDesc.length);
      console.log(travelList.length);
      console.log(condList.length);
      roomCount = longDesc.length;
      for (let i = 0; i < roomCount; i++) {
        locList[i + 1] = new Location(longDesc[i], briefDesc[i], travelList[i], condList[i]);
      }
      gameReady |= 1;
    }
  }
  /* Routines for savefile interaction (requires local storage) */
  function saveId(n) {
    return "adventSv" + n;
  }

  function saveExists(n) {
    return localStorage.hasOwnProperty(saveId(n));
  }
  /* Routine for making sure expectInput doesn't get stuck at 4 */
  function exitCode4(spot, stop = false) {
    if (!stop) {
      switch (saveFlg) {
        case 1: exitSaveMode(spot); break;
        case 3: exitLoadMode(spot); break;
        case 7: exitDelMode(spot); break;
        default: break;
      }
    }
    saveFlg = 0;
    requestInput();
  }

  function exitDelMode(spot) {
    let checkHighest = false;
    try {
      removeSaveFile(spot);
      if (spot > H.highestSave) {
        rSpeak(213);
        checkHighest = true;
      }
      else {
        printf("Savefile %d successfully removed.\n", spot);
        checkHighest = (spot == H.highestSave);
      }
    }
    catch (error) {
      rSpeak(214);
    }
    if (checkHighest) {
      let high = 0;
      for (let i = H.highestSave; i > 0; i--) {
        if (saveExists(i)) {
          high = i;
          break;
        }
      }
      H.highestSave = high;
      saveHelper();
    }
  }

  function exitLoadMode(spot) {
    try {
      loadSaveFile(spot);
      printf("Game state successfully loaded from slot %d\n", spot);
      lastSaveTurn = g.turns;
      locList[g.loc].visited = 0;
      describe();
      descItem();
      saveHelper();
    }
    catch (error) {
      rSpeak(208);
    }
  }

  function exitSaveMode(spot) {
    try {
      writeSaveFile(spot);
      printf("Game state successfully saved in slot %d\n", spot);
      lastSaveTurn = g.turns;
      if (spot > H.highestSave) H.highestSave = spot;
      saveHelper();
    }
    catch (error) {
      rSpeak(206);
    }
  }

  function removeSaveFile(n) {
    if (n > H.highestSave) {
      for (let i = 1; i <= H.highestSave; i++) {
        if (saveExists(i)) localStorage.removeItem(saveId(i));
      }
    }
    else if (saveExists(n)) localStorage.removeItem(saveId(n));
  }

  function loadSaveFile(n) {
    let tulos = localStorage.getItem(saveId(n));
    let G = JSON.parse(storageClean(tulos));
    let pit = G.length;
    let t = G[0]; /* version tag - future compatibility 
                   * currently we do nothing with it 
                   * it will help us interpret old saves if the format
                   * changes or new items/rooms/variables are added */
    let len = G[1]; /* number of object keys (sorted alphabetically) */
    for (let i = 0; i < len; i++) {
      g[gKeys[i]] = G[i+2];
    }
    let s = len + 2;
    len = G[s]; /* itemcount */
    for (let i = 0; i < len; i++) {
      let h = G[s+1+i];
      if (h.length) {
        itemList[itemKeys[i]].loc = h[0] - 1;
        itemList[itemKeys[i]].floc = h[1] - 1;
        itemList[itemKeys[i]].status = h[2] - 1;
      }
    }
    s += (len + 1);
    len = G[s]; /* no. of locations */
    let sp = 1;
    for (let i = s + 1; (sp < len) && (i < pit - 1); i = i+2) {
      let ct = G[i];
      let v = G[i+1];
      for (let j = 0; j < ct; j++) {
        locList[sp++].visited = v;   
      }
    }
    G.length = 0;
    if (g.gameId < H.gameId) {
      currentTick = 0;
      setTimerStatus(false);
    }
  }
  /* all the info in the savefile should take less than 1 KB */ 
  function writeSaveFile(n) {
    let G = [];
    G.push(versionTag);
    G.push(gKeys.length);
    for (let p of gKeys) {
      G.push(g[p]);
    }
    G.push(itemCount);
    for (let a of itemKeys) {
      let h = [];
      if (!itemList[a]) G.push(h); /* skipping indices is supported */
      else { /* we add 1 so that -1 becomes 0, and takes less space */
        h[0] = itemList[a].loc + 1;
        h[1] = itemList[a].floc + 1;
        h[2] = itemList[a].status + 1;
        G.push(h);
      }
    }
    G.push(roomCount);
    let p = 0, l = locList[1].visited;
    /* store visited locations through run length encoding */
    for (let i = 2; i <= roomCount; i++) {
      p++;
      if (locList[i].visited != l) {
        G.push(p);
        G.push(l);
        p = 0;
        l = locList[i].visited;
      }
    }
    G.push(++p);
    G.push(l);
    if (dbugFlg) {
      console.log(JSON.stringify(G));
      console.log(JSON.stringify(G).length);
    }
    localStorage.setItem(saveId(n), JSON.stringify(G));
    G.length = 0;
  }

  function delSave() {
    if (!hasLocalStorage) {
      rSpeak(204);
      exitCode4(null, 1);
      return;
    }
    if (!H.highestSave) {
      rSpeak(207);
      exitCode4(null, 1);
      return;
    }
    let spot = 0;
    if (H.highestSave == 1) {
      spot = 1;
      yes(212, 54, 210, function(yea) {
        if (!yea) {
          exitCode4(null, 1);
          return;
        }
        exitCode4(1);
      });
      return;
    }
    else {
      rSpeak(211);
      printf("Highest slot: %d (0 cancels, %d deletes all)\n", H.highestSave, H.highestSave + 1);
      yesHandler = function(slot) {
        if (typeof slot !== 'number') return; /* paranoia */
        if (!slot) { /* 0 cancels */
          rSpeak(210);
          exitCode4(null, 1);
          return;
        }
        if (slot > H.highestSave) {
          exitCode4(slot);
          return;
        }
        if (saveExists(slot)) {
          exitCode4(slot);
          return;
        }
        rSpeak(209);
        exitCode4(null, 1);
        return;
      };
      requestInput(4);
    }
  }

  function restore() {
    if (!hasLocalStorage) {
      rSpeak(204);
      exitCode4(null, 1);
      return;
    }
    if (!H.highestSave) {
      rSpeak(207);
      exitCode4(null, 1);
      return;
    }
    if (H.highestSave == 1) {
      if (!saveExists(1)) { /* huh? */
        rSpeak(208); 
        exitCode4(null, 1);
        H.highestSave = 0;
        saveHelper();
        return;    
      }
      exitCode4(1);
      return;
    }
    /* highestSave>1 - presume we have multiple saves to choose from */
    printf("Load from which slot? -- Highest used slot: %d\n", H.highestSave);
    yesHandler = function(slot) {
      if (!slot) {
        rSpeak(210);
        exitCode4(null, 1); /* slot 0 cancels */
        return;
      }
      let spot = Math.min(slot, H.highestSave);
      if (!saveExists(spot)) {
        rSpeak(209);
        exitCode4(null, 1);
        return;
      }
      exitCode4(spot);
    };
    requestInput(4);
  }

  var saveWarner = (function() {
    let warned = false;
    return function(mode) {
      if (mode) warned = true;
      if (warned) return;
      rSpeak(220);
      warned = true;
    }
  })();

  function saveGame() {
    if (!hasLocalStorage) {
      rSpeak(204);
      exitCode4(null, 1);
      return;
    }
    let spot = H.highestSave + 1;
    if (spot > 1) {
      printf("Save in which slot? -- Next unused slot: %d\n", H.highestSave + 1);
      yesHandler = function(slot) {
        if ((slot) && (typeof slot === 'number')) spot = Math.min(slot, spot);
        if (!spot) { /* 0 cancels */
          rSpeak(210);
          exitCode4(spot, !yea);
          return;
        }
        if (saveExists(spot)) {
          yes(205, 54, 54, function(yea) { /* look ma, nesting yesHandlers! */
            exitCode4(spot, !yea);
            return;
          });
        }
        else {
          exitCode4(spot);
          return;
        }
      };
      requestInput(4);
    }
    else {
      rSpeak(54);
      saveWarner();
      exitCode4(spot);
      return;
    }
  }
  function onTimer() {
    ccTimer.classList.remove("invisible");
  }
  function offTimer() {
    ccTimer.classList.add("invisible");
  }
  function setTimerStatus(on) {
    timedFromStart = on;
    ccTimer.style.color = (on ? "var(--green-timer)" : "var(--red-timer)");
  }
  function displayTimer() {
    let t = (currentTick % 72000);
    let h = Math.floor((currentTick + 2) / 72000);
    let m = Math.floor((t + 2) / 1200);
    let s = Math.floor(((currentTick % 1200) + 1) / 20);
    let text = "";
    if (h) text += (h + ":");
    if (m || text.length) text += (text.length ? m.toString().padStart(2, '0') : m) + ":";
    text += (text.length ? s.toString().padStart(2, '0') : s);
/*  let bodySize = +(getComputedStyle(document.body).getPropertyValue("font-size").slice(0, -2));
    ccTimer.style.fontSize = Math.max(80, 120 - Math.max(0, Math.ceil(text.length / 2) * 10 - 20)) + "%"; */
    ccTimer.style.fontSize = "120%";
    if (dbugFlg) ccTimer.innerHTML = (window.innerHeight) + "/" + (window.innerWidth); /* big phony */
    else ccTimer.innerHTML = text;
  }
  function updateTick() {
    if (!currentTick) setTimerStatus(!g.turns);
    if (!(currentTick % 20)) displayTimer();
    currentTick++;
  }
  function startTimer() {
    onTimer();
    if (timerMode == 0) timerMode = setInterval(updateTick, 50);
  }
  function stopTimer() {
    if (timerMode != 0) clearInterval(timerMode);
    timerMode = 0;
  }
  function resetTimer() {
    stopTimer();
    setTimerStatus(true);
    timedFromStart = false;
    ccTimer.innerHTML = "";
    currentTick = 0;
  }
  function disableTimer() {
    resetTimer();
    offTimer();
  }
  /* Routines for managing parser state */

  /* We use a fake input area to permit the custom caret
   * We still run a real input area in the background to
   * take advantage of its built-in functionality */
  function updateParser() {
    if ((ccInput.value.length) && (expectInput == 4)) {
      ccInput.value = numify(ccInput.value);
    }
    let j = textInput = ccInput.value;
    if (j.length) j = j.replace(/\s/g, "\u00a0");
    ccParser.innerText = ">" + j;
  }

  function requestInput(e = 1) {
    flushInput();
    if (expectInput == 3) ccAnyKey.classList.add("invisible");
    expectInput = e;
    ccParser.style.display = 'inline';
    ccCursor.style.display = 'inline-block';
    focus(); /* focus last to make sure the parser and cursor are included in scrolling */
  }

  function disableInput(e = 0) {
    flushInput();
    expectInput = e;
    unfocus();
    ccParser.style.display = 'none';
    ccCursor.style.display = 'none';
    if (e == 3) ccAnyKey.classList.remove("invisible");
  }

  function setAllParsers(j) {
    ccInput.value = j;
    updateParser();
  }

  function textClean() {
    textInput = textInput.replace(/[^a-zA-Z ?2]/g, "");
    textInput = textInput.toLowerCase();
    textInput = textInput.replace(/(\s+the\s)|(\s+)/g, " ");
  }

  function numify(p) {
    if (!p) return "";
    return p.replace(/[^\d]/g, "");
  }

  function flushInput(record = false) {
    if (textInput) {
      ccText.innerHTML += '&gt;' + textInput + '<br>';
      if (record) commandList.push(textInput);
    }
    setAllParsers("");
    if (S.allowUpDown) lineBacker(); /* let lineBacker() know there is no line */
    cursorMove('End');
    linePos = 0;
    if ((assumeMobileMode > 0) && (flushTimer == 0) && (demoMode != 0)) {
      flushTimer = setTimeout(mobileFlush, 20); 
    }
  }

  function mobileFlush() {
    textInput = "";
    flushInput();
    flushTimer = 0;
  }

  function scroll() {
    if (expectInput != 3) ccParser.scrollIntoView();
    else ccAnyKey.scrollIntoView();
/*  const scrTgt = (document.scrollingElement || document.body);
    scrTgt.scrollTop = scrTgt.scrollHeight; */
  }

  function focus() {
    ccInput.focus();
    ccInput.click();
    scroll();
  }

  function unfocus() {
    ccInput.blur();
  }

  function cursorMove(a) {
    var truePos = function(){ return textInput.length + cursorPos; };
/*  if (dbugFlg) console.log(truePos()); */
    switch (a) {
      case 'ArrowLeft': {
        if (truePos() > 1) cursorPos--;
        break;
      }
      case 'Delete': {
        if (cursorPos == 1) break;
      } /* fall through */ 
      case 'ArrowRight': {
        cursorPos = Math.min(1, cursorPos + 1);
        break;
      }
      case 'Home': {
        cursorPos = 1 - textInput.length;
        break;
      }
      case 'End': {
        cursorPos = 1;
        break;
      }
      default: break;
    }
    ccCursor.style.left = (cursorPos - 2) + "ch"; 
    /* ideally this should not be needed, but browsers are cursed... */
    if (a != 'Delete') cursorMaintainer();
  }

  function feedInput(w) {
    setAllParsers(w);
    keyReacter({"key": "Demo"});
  }

  /* I forget why this is needed - things seemed to work fine
   * without this being initialized properly... */
  function inputReacter(evt) {
    updateParser();
  }

  function pasteReacter(evt) {
    evt.preventDefault();
    return false; /* do your own homework */
  }

  /* Check if player is submitting parser input */
  function keyReacter(evt) {
    if (expectInput < 1) return;
    if (demoMode != 0) {
      if (evt.key != 'Demo') return;
    }
    if (S.useTimer) {
      if (evt.key == 'F9') {
        if (timerMode == 0) startTimer();
        else resetTimer();
      }
    }
    if (expectInput == 3) {
      setAllParsers("");
      ccAnyKey.classList.add("invisible");
      requestInput();
      yesHandler();
      return;
    }
    if (expectInput == 4) {
      if (!ccInput.matches(':focus')) {
        focus();
      }
      updateParser();
      switch (evt.key) {
        case 'Enter': {
          if (!textInput.length) break;
          let slot = numify(textInput); 
          disableInput();
          flushInput();
          yesHandler(+ slot); /* converts slot from string to number */
          break;
        }
        default: break;
      }
      return;
    }
    if (expectInput == 5) {
      if (ccInput.matches(':focus')) {
        blur();
      }
      if (evt.key == 'Escape') {
        closeSettings();
        return;
      }
      if (evt.key.length === 1) {
        let k = evt.key.toUpperCase();
        if ((k >= 'A') && (k <= 'Z')) {
          /* check for settings toggle keys */  
          for (let o of optList) {
            if (o.type != "checkbox") {
              if (o.key != k) continue;
              document.getElementById(o.name).focus(); 
              continue;
            }
            if (o.key != k) continue;
            document.getElementById(o.name).click();
            return;
          }
        }
      }
    }
    if (expectInput < 3) {
      if ((!g.turns) && (S.useTimer) && ((!currentTick) || (timerMode == 0))) {
        startTimer();
      }
      if (!ccInput.matches(':focus')) {
        focus();
      }
      updateParser();
      switch (evt.key) {
        case 'ArrowLeft':
        case 'ArrowRight': 
        case 'Delete': 
        case 'Home': 
        case 'End': cursorMove(evt.key); break;
        case 'ArrowUp': {
          if (S.allowUpDown) lineBacker(evt.key);
          else cursorMove('Home');
          break;
        }
        case 'ArrowDown': {
          if (S.allowUpDown) lineBacker(evt.key);
          else cursorMove('End');
          break;
        }
        case 'PageUp': {
          if (assumeMobileMode > 0) break;
        } /* fall through */
        case 'PageDown': {
          if (!S.allowPageUpDown) break;
        } /* fall through */
        case 'Escape': lineBacker(evt.key); break;
        case 'F7': openSettings(); break;
        default: break;
      }
      if ((evt.key == "Enter") || (evt.key == 'Demo')) {
        if (flushTimer != 0) {
          mobileFlush();
          return;
        };
        if (!textInput.length) return;
        switch (expectInput) {
          case 1: {
            if (english()) turnEnd();
            else requestInput();
            break;
          }
          case 2: {
            textClean();
            let yea = !textInput.match(/^n/i); /* before we flush input! */
            expectInput = 0;
            flushInput(true);
            yesHandler(yea);
            break;
          }
          default:
            break;
        }
      }
    }
  }

  function settingsReacter(evt) {
    var caller = evt.target || evt.srcElement;
    var id = caller.id;
    T[id] = (caller.type == "checkbox") ? (caller.checked ? 1 : 0) : (caller.value == +caller.value) ? +caller.value : T[id];
    if (caller.type == "number") caller.setAttribute("value", T[id]);
    unsavedSettings = true;
  }

  function copySettings(S, T, doTrack = false) {
    let optCount = S.length;
    Object.keys(S).forEach((a) => {
      if ((T[a] !== 'undefined') && (S[a] == T[a])) return;
      T[a] = S[a];
      if (a === 'noFlicker') {
        if (S[a]) ccCursor.classList.add("noflicker");
        else ccCursor.classList.remove("noflicker");
      }
      else if (a === 'allCaps') {
        document.getElementById("playarea").style.textTransform = S[a] ? "uppercase" : "initial";
      }
      else if (a === 'useTimer') {
        if (S[a]) {
          startTimer();
        } else disableTimer();
      }
      else if (a === 'problemBrowser') {
        if (S[a] == assumeProblemBrowser) toggleMargin(0); 
        else trackWindowSize();
      }
      if (doTrack) g.modifications |= (1 << optIndices[a]);
    });
  }

  function openSettings() {
    if (expectInput == 5) {
      closeSettings();
      return;
    }
    ccSettings.style.display = 'block';
    oldExpectInput = expectInput;
    disableInput(5);
    copySettings(S, T);
  }

  function closeSettings() {
    if (expectInput != 5) return; /* paranoia */
    ccSettings.style.display = 'none';
    if (oldExpectInput) requestInput(oldExpectInput);
    if (unsavedSettings) {
      copySettings(T, S, true);
      saveSettings();
    }
  }

  function saveSettings() {
    if (!hasLocalStorage) return;
    localStorage.setItem(setter, JSON.stringify(S));
    unsavedSettings = false;
  }

  function saveHelper() {
    if (!hasLocalStorage) return;
    localStorage.setItem(helper, JSON.stringify(H));
  }

  /* Try to alert player before page is unloaded */
  function unloadResponder(evt) {
    if ((!stopGame) && (g.turns > lastSaveTurn + 5)) {
      evt.preventDefault();
      return (evt.returnValue = "Exit Colossal Cave Adventure despite unsaved progress?");
    }
    return null;
  }

  /* Routine to take 1 turn */
  function turn() {
    let i;
    /* if closing, then we can't leave except via the main office */
    if (g.newLoc < 9 && g.newLoc != 0 && g.closing) {
      rSpeak(130);
      g.newLoc = g.loc;
      panic();
    }
    /* see if a dwarf has seen us and has come from where we want to go */
    if (g.newLoc != g.loc && !forced(g.loc) && (lcond(g.loc, NOPIRAT) == 0))
      for (i = 0; i < (DWARFMAX - 1); ++i)
        if (g.odLoc[i] == g.newLoc && g.dSeen[i]) {
          g.newLoc = g.loc;
          rSpeak(2);
          if (demoMode != 0) demoAlert = true;
          break;
        }

    if (dwarves()) return; /* & special dwarf(pirate who steals) */

    /* added by BDS C conversion */
    if ((g.loc != g.newLoc) || ((g.loc == 115) && (!locList[g.loc].visited))) {
      ++g.turns;
      g.loc = g.newLoc;

      /* check for death */
      if (g.loc == 0) {
        death();
        return;
      }

      /* check for forced move */
      if (forced(g.loc)) {
        describe();
        doMove();
        return;
      }

      /* check for wandering in dark */
      if (g.wzDark && dark() && pct((demoMode != 0) ? 100 : 35)) {
        rSpeak(23);
        g.oldLoc2 = g.loc;
        death();
        return;
      }

      /* describe his situation */
      describe();
      if (!dark()) {
        locList[g.loc].visited++;
        descItem();
      }
      /* causes occasional "move" with no describe & descItem */
    }

    if (g.closed) {
      if (prop("OYSTER") < 0 && toting("OYSTER"))
        pSpeak("OYSTER", 1);
      itemList.forEachName((i) => {
        if (toting(i) && prop(i) < 0)
          propSet(i, -1 - prop(i));
      });
    }

    g.wzDark = dark();
    if (g.knfLoc > 0 && g.knfLoc != g.loc)
      g.knfLoc = 0;

    requestInput();
    sTimer(); /* as the grains of sand slip by */
  }

  function turnEnd() {
    if (expectInput != 3) disableInput();
    if (dbugFlg) console.log(`loc = ${g.loc}, verb = ${verb}, object = ${object}, motion = ${motion}`);

    if (motion) /* execute player instructions	*/
      doMove();
    else if (object)
      doObj();
    else if (verb)
      itVerb();
    if (expectInput > 1) return;
    switch (saveFlg) {
      case 0: {
        if (stopGame) return;
        turn();
        break;
      }
      case 1:
      case 2: saveGame(); break;
      case 3:
      case 4: restore(); break;
      case 5: restartGame(); break;
      case 7: delSave(); break;
      default: /* huh? */
        saveFlg = 0;
        requestInput();
        break;
    }
  }

  /* Routine to describe current location */
  function describe() {
    if (toting("BEAR"))
      rSpeak(141);
    if (dark())
      rSpeak(16);
    else if (locList[g.loc].visited)
      descSh(g.loc);
    else
      descLg(g.loc);
    if (g.loc == 33 && pct(25) && !g.closing) {
      rSpeak(8);
      learnMagic("plugh");
    }
    else if (g.loc == 100) {
      learnMagic("plover");
    }
  }

  /* Routine to describe visible items */
  function descItem() {
    itemList.forEachName((i) => {
      if (at(i)) {
        if (i == "STEPS" && toting("NUGGET"))
          return;
        if (prop(i) < 0) {
          if (g.closed) return;
          if (i == "RUG" || i == "CHAIN")
            propSet(i, 1);
	  else propSet(i, 0);
          --g.tally;
        }
        let state;
        if (i == "STEPS" && g.loc == fixed("STEPS"))
          state = 1;
        else
          state = prop(i);
        pSpeak(i, state);
      }
    });
    if (g.tally == g.tally2 && g.tally != 0 && g.limit > 35)
      g.limit = 35;
  }

  /* Learn a new magic word */
  function learnMagic(word) {
    g.magicLearned |= (1 << magicWords.indexOf(wordList[word]));
    if (dbugFlg) console.log(`Magic learned: ${g.magicLearned}`);
  }

  /* Routine to handle motion requests */
  function doMove() {
    travel = locList[g.loc].travelList;
    switch (motion) {
      case mTgts.nowhere:
        break;
      case mTgts.back:
        goBack();
        break;
      case mTgts.look:
        if (g.detail++ < 3)
          rSpeak(15);
        g.wzDark = 0;
        locList[g.loc].visited = 0;
        g.newLoc = g.loc;
        g.loc = 0;
        break;
      case mTgts.cave:
        if (g.loc < 8)
          rSpeak(57);
        else
          rSpeak(58);
        break;
      default:
        let i;
        if ((!S.allowEarlyMagic) && ((i = magicWords.indexOf(motion)) + 1)) {
          if (!(g.magicLearned & (1 << i))) {
            rSpeak(219);
            break;
          }
        }
        g.oldLoc2 = g.oldLoc;
        g.oldLoc = g.loc;
        doTrav();
    }
    requestInput();
  }

  /* Routine to handle request to return from whence we came! */
  function goBack() {
    var kk, k2, want, temp;

    if (forced(g.oldLoc))
      want = g.oldLoc2;
    else
      want = g.oldLoc;
    g.oldLoc2 = g.oldLoc;
    g.oldLoc = g.loc;
    k2 = 0;
    if (want == g.loc) {
      rSpeak(91);
      return;
    }
    for (kk = 0; kk < travel.length; kk++) {
      if (!travel[kk].tcond && travel[kk].tdest == want) {
        motion = travel[kk].tverb;
        doTrav();
        return;
      }
      if (!travel[kk].tcond) {
        temp = travel[kk].tdest;
        if (forced(temp) && locList[temp].travelList[0].tdest == want) k2 = kk;
      }
    }
    if (k2) {
      motion = travel[k2].tverb;
      doTrav();
    } else
      rSpeak(140);
  }

  /* Routine to figure out a new location
     given current location and a motion */
  function doTrav() {
    var mvflag, hitflag, rdest, rverb, rcond, robject, pctt, kk;

    g.newLoc = g.loc;
    mvflag = hitflag = 0;
    pctt = rand(100);

    for (kk = 0;
      ((kk < travel.length) && !mvflag); kk++) {
      rdest = travel[kk].tdest;
      rverb = travel[kk].tverb;
      rcond = travel[kk].tcond;
      robject = rcond % OBJ_LIMIT;

      if (dbugFlg) console.log(`rdest = ${rdest}, rverb = ${rverb}, rcond = ${rcond}, \
robject = ${robject} in doTrav`);
      if ((rverb != 1) && (rverb != motion) && !hitflag)
        continue;
      ++hitflag;
      switch (Math.floor(rcond / OBJ_LIMIT)) {
        case 0:
          if ((rcond == 0) || (pctt < rcond))
            ++mvflag;
          break;
        case 1:
          if (robject == 0)
            ++mvflag;
          else if (toting(robject))
            ++mvflag;
          break;
        case 2:
          if (toting(robject) || at(robject))
            ++mvflag;
          break;
        case 3:
        case 4:
        case 5:
        case 7:
          if (prop(robject) != (Math.floor(rcond / OBJ_LIMIT) - 3))
            ++mvflag;
          break;
        default:
          bug(37);
      }
    }
    if (!mvflag)
      badMove();
    else if (rdest > 500)
      rSpeak(rdest - 500);
    else if (rdest > 300)
      spcMove(rdest);
    else {
      g.newLoc = rdest;
      if (dbugFlg) printf("newLoc in doTrav = %d\n", g.newLoc);
    }
  }

  /* The player tried a poor move option */
  function badMove() {
    let msg = 12;

    if (motion >= 43 && motion <= 50)
      msg = 9;
    if (motion == 29 || motion == 30)
      msg = 9;
    if (motion == 7 || motion == 36 || motion == 37)
      msg = 10;
    if (motion == 11 || motion == 19)
      msg = 11;
    if (verb == v("find") || verb == v("i"))
      msg = 59;
    if (motion == 62 || motion == 65)
      msg = 42;
    if (motion == 17)
      msg = 80;
    rSpeak(msg);
  }

  /* Routine to handle very special movement */
  function spcMove(rdest) {
    switch (rdest - 300) {
      case 1:
        /* plover movement via alcove */
        if (!g.holding || (g.holding == 1 && toting("EMERALD")))
          g.newLoc = (99 + 100) - g.loc;
        else
          rSpeak(117);
        break;
      case 2:
        /* trying to remove plover, bad route */
        drop("EMERALD", g.loc);
        break;
      case 3:
        /* TROLL bridge */
        if (prop("TROLL") == 1) {
          pSpeak("TROLL", 1);
          propSet("TROLL", 0);
          move("TROLL2", 0);
          move(bumpid("TROLL2"), 0);
          move("TROLL", 117);
          move(bumpid("TROLL"), 122);
          juggle("CHASM");
          g.newLoc = g.loc;
        } else {
          g.newLoc = (g.loc == 117 ? 122 : 117);
          if (prop("TROLL") == 0) propSet("TROLL", 1);
          if (!toting("BEAR"))
            return;
          rSpeak(162);
          propSet("CHASM", 1);
          propSet("TROLL", 2);
          drop("BEAR", g.newLoc);
          fixedSet("BEAR", -1);
          propSet("BEAR", 3);
          if (prop("SPICES") < 0)
            ++g.tally2;
          g.oldLoc2 = g.newLoc;
          death();
        }
        break;
      default:
        bug(38);
    }
  }

  /* Routine to handle player's demise via waking up the dwarves... */
  function dwarfEnd() {
    death();
    normEnd();
  }

  /* normal end of game */
  function normEnd() {
    if (timerMode != 0) stopTimer();
    score();
    stopGame = 1;
    if (demoMode !== 0) stopDemo();
    requestInput();
  }

  /* scoring */
  function score() {
    let t = i = k = s = 0;
    itemList.forEachTreasure((a) => {
      k = a.score;
      i = itemKeys[a.index];
      if (place(i) == 3 && prop(i) == 0)
        t += k;
      else if (prop(i) >= 0) t += 2; /* pity points for seeing the treasure */
    });
    printf("%-20s%d\n", "Treasures:", s = t);
    t = (3 - g.numDie) * 10;
    if (t)
      printf("%-20s%d\n", "Survival:", t);
    s += t;
    t = g.dFlag ? 25 : 0;
    if (t)
      printf("%-20s%d\n", "Getting well in:", t);
    s += t;
    t = g.closing ? 25 : 0;
    if (t)
      printf("%-20s%d\n", "Masters section:", t);
    s += t;
    if (g.closed) {
      if (g.bonus == 0)
        t = 10;
      else if (g.bonus == 135)
        t = 25;
      else if (g.bonus == 134)
        t = 30;
      else if (g.bonus == 133)
        t = 45;
      printf("%-20s%d\n", "Bonus:", t);
      s += t;
    }
    t = 2;
    if (!g.gaveUp)
      t += 4;
    printf("%-20s%d\n", "Adventuring spirit:", t);
    s += t;
    if (place("MAGAZINE") == 108)
      s += 1;
    printf("%-20s%d\n", "Score:", s);
  }

  /* RIP player... or not? */
  function death() {
    if (!g.closing) {
      stopGame = 1;
      yes(81 + g.numDie * 2, 82 + g.numDie * 2, 54, function(yea) {
        if ((++g.numDie >= 3) || (!yea))
	{
          normEnd();
	  return;
	}
        if (!S.keepItems) {
          placeSet("WATER", 0);
          placeSet("OIL", 0);
          if (toting("LAMP"))
            propSet("LAMP", 0);
          itemList.forEachName((i) => {
            if (toting(i))
              drop(i, i == "LAMP" ? 1 : g.oldLoc2);
          });
        }
        g.newLoc = 3;
        g.oldLoc = g.loc;
        stopGame = 0;
        turn();
        return;
      });
      return;
    }
    /* closing -- no resurrection... */
    rSpeak(131);
    ++g.numDie;
    normEnd();
  }

  /* Routine to process an object */
  function doObj() {
    /* object here?  if so, transitive */
    if (fixed(object) == g.loc || here(object) || ((dbugFlg) && (verb == v("gimme"))))
      trObj();
    /* grate as destination? */
    else if (object == "GRATE") {
      if (g.loc == 1 || g.loc == 4 || g.loc == 7) {
        motion = mTgts.depression;
        doMove();
      } else if (g.loc > 9 && g.loc < 15) {
        motion = mTgts.entrance;
        doMove();
      }
    }
    /* is it a dwarf? */
    else if (dCheck() && g.dFlag >= 2) {
      object = "DWARF";
      trObj();
    }
    /* trying to get/use a liquid?*/
    else if ((liq() == object && here("BOTTLE")) || liqLoc(g.loc) == object)
      trObj();
    else if (object == "PLANT" && at("PLANT2") && prop("PLANT2") == 0) {
      object = "PLANT2";
      trObj();
    }
    /* trying to grab a knife? */
    else if (object == "KNIFE" && g.knfLoc == g.loc) {
      rSpeak(116);
      g.knfLoc = -1;
    }
    /* trying to get at dynamite? */
    else if (object == "ROD" && here("ROD2")) {
      object = "ROD2";
      trObj();
    } else
      printf("I see no %s here.\n", prObj(object));
  }

  /* Routine to process an object being referred to */
  function trObj() {
    if (verb)
      trVerb();
    else
      printf("What do you want to do with the %s?\n", prObj(object));
  }

  /* Routine to print word corresponding to object */
  function prObj() {
    return isNoun(word1) ? word1 : word2;
  }

  /* dwarf stuff */
  function dwarfLocIsGood(j, i) {
    if (j < 15) return false;
    if (j == g.odLoc[i]) return false;
    if (j == g.dLoc[i]) return false;
    if ((i == (DWARFMAX - 1)) && (lcond(j, NOPIRAT) == NOPIRAT)) return false;
    return true;
  }
  function dwarves() {
    /* see if dwarves allowed here */
    if (g.newLoc == 0 || forced(g.newLoc) || (lcond(g.newLoc, NOPIRAT)))
      return 0;
    /* see if dwarves are active */
    if (!g.dFlag) {
      if (g.newLoc >= 15) /* like original */
        ++g.dFlag;
      return 0;
    }
    let i, j, k, attack, stick, dtotal;
    /* if first close encounter (of 3rd kind) kill 0, 1 or 2 */
    if (g.dFlag == 1) {
      if (g.newLoc < 15 || pct(95))
        return 0;
      ++g.dFlag;
      for (i = 1; i < 3; i++)
        if (pct(50)) g.dLoc[rand(DWARFMAX - 2)] = 0;
      for (i = 0; i < (DWARFMAX - 1); i++) {
        if (g.dLoc[i] == g.newLoc)
          g.dLoc[i] = dAltLoc;
        g.odLoc[i] = g.dLoc[i];
      }
      rSpeak(3);
      drop("AXE", g.newLoc);
      return 0;
    }
    dtotal = attack = stick = 0;
    for (i = 0; i < DWARFMAX; i++) {
      if (g.dLoc[i] == 0)
        continue;
      if (!S.dMoveMethod) { /* move a dwarf entirely at random */
        for (let yri = 1; yri < 20; yri++) {
          j = rand(106) + 15; /* allowed area */
          if (dwarfLocIsGood(j, i)) break;
          j = 0;
        }
      }
      else { /* move a dwarf at random along the actual passages */
        travel = locList[g.dLoc[i]].travelList; 
        let yri = 1;
        let lastTried = j = 0;
        for (let kk of travel) {
          if (yri >= 20) break;
          if (kk.tdest > roomCount) continue;
          if (kk.tcond == OBJ_LIMIT) continue;
          if (kk.tdest == lastTried) continue;
          if (!dwarfLocIsGood(kk.tdest, i)) continue;
          lastTried = kk.tdest;
          if (one_in_(yri++)) j = lastTried;
        }
      }
      if (j == 0) j = g.odLoc[i];
      g.odLoc[i] = g.dLoc[i];
      g.dLoc[i] = j;
      if ((g.dSeen[i] && g.newLoc >= 15 && g.newLoc != 115) 
          || g.dLoc[i] == g.newLoc || g.odLoc[i] == g.newLoc)
        g.dSeen[i] = 1;
      else
        g.dSeen[i] = 0;
      /* optionally guarantee the pirate in endgame */
      if ((S.alwaysSpawnPirate) && (g.tally == g.tally2 + 1)) doPirate(true);
      if (!g.dSeen[i])
        continue;
      g.dLoc[i] = g.newLoc;
      if (i == DWARFMAX - 1)
        doPirate();
      else {
        ++dtotal;
        if (g.odLoc[i] == g.dLoc[i]) {
          ++attack;
          if (g.knfLoc >= 0)
            g.knfLoc = g.newLoc;
          if (pml(S.knifeHitPml * (g.dFlag - 2)))
            ++stick;
        }
      }
    }
    if (dbugFlg) console.log(`Dwarf locations: ${JSON.stringify(g.dLoc)}`);
    if (dtotal == 0)
      return 0;
    if (dtotal > 1)
      printf("There are %d threatening little dwarves in the room with you!\n", dtotal);
    else
      rSpeak(4);
    if (attack == 0)
      return 0;
    if (g.dFlag == 2)
      ++g.dFlag;
    if (attack > 1) {
      printf("%d of them throw knives at you!!\n", attack);
      k = 6;
    } else {
      rSpeak(5);
      k = 52;
    }
    if (stick <= 1) {
      rSpeak(stick + k);
      if (stick == 0)
        return 0;
    } else
      printf("%d of them get you !!!\n", stick);
    g.oldLoc2 = g.newLoc;
    death();
    return 1;
  }
  /* pirate stuff */
  function doPirate(special = false) {
    let p = DWARFMAX - 1,
      j, k = 0,
      doSteal = false;

    if (g.newLoc == g.chLoc || prop("CHEST") >= 0)
      return 0;

    itemList.forEachTreasure((a) => {
      if (doSteal) return;
      let o = itemKeys[a.index];
      if (o != "PYRAMID" || (g.newLoc != place("PYRAMID") && g.newLoc != place("EMERALD"))) {
        if (toting(o)) doSteal = true;
        if (here(o)) k++;
      }
    });
    if (!doSteal) {
      /* spawn pirate if all items have been found or permalost */
      if (g.tally == g.tally2 + 1 && k == 0 && !place("CHEST") &&
          here("LAMP") && prop("LAMP") == 1) {
        rSpeak(186);
        move("CHEST", g.chLoc);
        move("MESSAGE", g.chLoc2);
        g.dLoc[p] = g.chLoc;
        g.odLoc[p] = g.chLoc;
        g.dSeen[p] = 0;
        return;
      }
      if (g.odLoc[p] != g.dLoc[p] && pct(20)) {
        rSpeak(127);
        return;
      }
      return;
    }
    if (special) return; /* the pirate isn't actually here */
    rSpeak(128);
    if (!place("MESSAGE"))
      move("CHEST", g.chLoc);
    move("MESSAGE", g.chLoc2);
    itemList.forEachTreasure((a) => {
      let j = itemKeys[a.index];
      if (j == "PYRAMID" && (g.newLoc == place("PYRAMID") || g.newLoc == place("EMERALD")))
        return;
      if (at(j) && !fixed(j))
        carry(j, g.newLoc);
      if (toting(j))
        drop(j, g.chLoc);
    });
    g.dLoc[p] = g.chLoc;
    g.odLoc[p] = g.chLoc;
    g.dSeen[p] = 0;
  }
  /* special time limit stuff... */
  function sTimer() {
    let i;

    g.foobar = g.foobar > 0 ? -g.foobar : 0;
    if (dbugFlg) console.log(`Loc: ${g.loc} Tally: ${g.tally} Clock1: ${g.clock1}`);
    if ((g.clock1 > 0) && (g.tally == (S.easyClosing ? g.tally2 : 0)) && 
         g.loc >= 15 && g.loc != 33) {
      --g.clock1;
    }
    if (g.clock1 == 0) {
      /* start closing the cave */
      propSet("GRATE", 0);
      propSet("FISSURE", 0);
      for (i = 0; i < DWARFMAX; i++)
        g.dSeen[i] = 0;
      move("TROLL", 0);
      move(bumpid("TROLL"), 0);
      move("TROLL2", 117);
      move(bumpid("TROLL2"), 122);
      juggle("CHASM");
      if (prop("BEAR") != 3)
        dstroy("BEAR");
      propSet("CHAIN", 0);
      fixedSet("CHAIN", 0);
      propSet("AXE", 0);
      fixedSet("AXE", 0);
      rSpeak(129);
      g.clock1 = -1;
      g.closing = 1;
      return 0;
    }
    if (g.clock1 < 0)
      --g.clock2;
    if (g.clock2 == 0) { /* set up storage room and close the cave */
      propPut("BOTTLE", 115, 1);
      propPut("PLANT", 115, 0);
      propPut("OYSTER", 115, 0);
      propPut("LAMP", 115, 0);
      propPut("ROD", 115, 0);
      propPut("DWARF", 115, 0);
      g.loc = 115;
      g.oldLoc = 115;
      g.newLoc = 115;
      put("GRATE", 116, 0);
      propPut("SNAKE", 116, 1);
      propPut("BIRD", 116, 1);
      propPut("CAGE", 116, 0);
      propPut("ROD2", 116, 0);
      propPut("PILLOW", 116, 0);
      propPut("MIRROR", 115, 0);
      fixedSet("MIRROR", 116);
      itemList.forEachName((i) => {
        if (toting(i))
          dstroy(i);
      });
      rSpeak(132);
      g.closed = 1;
      disableInput(3);
      scroll();
      yesHandler = () => { turn(); };
      return 1;
    }
    if (prop("LAMP") == 1)
      --g.limit;
    if (g.limit <= 30 && here("BATTERIES") && prop("BATTERIES") == 0 && here("LAMP")) {
      rSpeak(188);
      propSet("BATTERIES", 1);
      if (toting("BATTERIES"))
        drop("BATTERIES", g.loc);
      g.limit += 2500;
      g.lmWarn = 0;
      return 0;
    }
    if (g.limit == 0) {
      --g.limit;
      propSet("LAMP", 0);
      if (here("LAMP"))
        rSpeak(184);
      return 0;
    }
    if (g.limit < 0 && g.loc <= 8) {
      rSpeak(185);
      g.gaveUp = 1;
      normEnd();
    }
    if (g.limit <= 30) {
      if (g.lmWarn || !here("LAMP"))
        return 0;
      g.lmWarn = 1;
      i = 187;
      if (place("BATTERIES") == 0)
        i = 183;
      if (prop("BATTERIES") == 1)
        i = 189;
      rSpeak(i);
      return 0;
    }
    return 0;
  }
  /* Routine to request a yes or no answer to a question.
   * Cursed because JavaScript */
  function yes(msg1, msg2, msg3, callback) {
    yesHandler = function(a) {
      if (!a) {
        if (msg3) rSpeak(msg3);
      } else if (msg2) rSpeak(msg2);
      callback(a);
    };
    if (msg1) rSpeak(msg1);
    requestInput(2);
  }

  /* Print a generic message (advent4.json) */
  function rSpeak(msg) {
    if (!msg) return;
    else msg--; /* expectations off by one because original array started at 1 */
    if (!msgList[msg]) {
      bug(34);
      return;
    }
    if (msg == 217) weirdBreaksMode = 3; /* populate anykey */
    mSpeak(msgList[msg]);
  }

  function mSpeak(arr, noEmpty = false) {
    if (!arr) return;
    weirdBreaksMode++;
    let tgt = (weirdBreaksMode > 3) ? ccAnyKey : ccText;
    for (let i = 0; i < arr.length; i++) {
      let newLine = (!noEmpty) || (arr[i].length > 0);
      printf("%s%s", (arr[i].length ? arr[i] : " "), newLine ? "\n" : "");
      if (maxPit != 72) {
        if ((i == arr.length - 1) || (arr[i+1].length < 2)) {
          tgt.innerHTML += "<br>";
          newLineReady = true;
          continue;
        }
        addResponsiveLineBreak();
      }
    }
    weirdBreaksMode = 0;
    maxPit = 72;
    if (!newLineReady) {
      tgt.innerHTML += "<br>";
    }
    else newLineReady = false;
    if (expectInput == 3) scroll();
  }

  /* Print an item message for a given state (advent3.json) */
  function pSpeak(item, state = 0) {
    if (!item) return;
    item = objectify(item);
    state++; /* original array started at -1... */
    if (!oOk(item) || !itemList[item].messages) {
      bug(31);
      return;
    }
    if (state >= itemList[item].messages.length) {
      printf("ERROR 32: Item message %s/%d does not exist - please report", item, state);
      return;
    }
    mSpeak(itemList[item].messages[state], true);
  }

  /* Print a long location description (advent1.json) */
  function descLg(loc) {
    if (!loc) return;
    if (!(loc < locList.length)) {
      bug(33);
      return;
    }
    if (loc == 11) {
      learnMagic("xyzzy");
    }
    mSpeak(locList[loc].longDesc);
  }

  /* Print a short location description (advent2.json) */
  function descSh(loc) {
    if (!loc) return;
    if (!(loc < locList.length)) {
      bug(33);
      return;
    }
    mSpeak(locList[loc].briefDesc);
  }

  /* look up vocabulary word.  words may have two entries 
     with different codes. if minimum acceptable value
     = 0, then return minimum of different codes. 
     word is the word to look up.
     val  is the minimum acceptable value,
     if != 0 return %1000 */
  function vocab(key, val) {
    if (!wordList[key]) {
      if (!S.shortWords || !shortWordList[key]) return -1;
      key = shortWordList[key];
    }
    if (typeof(wordList[key]) !== "object") return (val ? (wordList[key] % 1000) : wordList[key]);
    let v1 = wordList[key].reduce((a, b) => {
      return ((b >= val) && (b < a) ? b : a);
    });
    return (val ? (v1 % 1000) : v1);
  }


  /* Utility Routines */

  /* Routine to test for darkness */
  function dark() {
    return (!lcond(g.loc, LIGHT)) && (!prop("LAMP") || !here("LAMP"));
  }

  /* Routine to tell if an item is present */
  function here(item) {
    return ((place(item) == g.loc) || toting(item));
  }

  /* Routine to tell if an item is being carried */
  function toting(item) {
    return (place(item) == -1);
  }

  /* Routine to tell if a location causes a forced move */
  function forced(atloc) {
    return (lcond(atloc) == 2);
  }

  /* Routine to tell if player is on either side of a two sided object */
  function at(item) {
    return ((place(item) == g.loc) || (fixed(item) == g.loc));
  }

  /* Routine to destroy an object */
  function dstroy(obj) {
    move(obj, 0);
  }

  /* Routine to move an object */
  function move(obj, where) {
    obj = objectify(obj);
    let from = (oidx(obj) < itemCount) ? place(obj) : fixed(oidx(obj) % itemCount);
    if (from > 0 && from <= 300)
      carry(obj, from);
    drop(obj, where);
  }

  /* Juggle an object (currently a no-op)
   * Original purpose was to change the order of things at the location */
  function juggle(loc) {}

  /* Routine to carry an object */
  function carry(obj) {
    obj = objectify(obj);
    if (oOk(obj)) {
      if (place(obj) == -1)
        return;
      placeSet(obj, -1);
      ++g.holding;
    }
  }

  /* Routine to drop an object */
  function drop(obj, where) {
    obj = objectify(obj);
    if (oOk(obj)) {
      if (place(obj) == -1)
        --g.holding;
      placeSet(obj, where);
    } else if ((typeof(obj) === 'number') && (obj >= itemCount))
      fixedSet(obj % itemCount, where);
  }

  /* routine to move an object and return a
     value used to set the negated prop values
     for the repository */
  function put(obj, where, pval) {
    move(obj, where);
    return (-1 - pval);
  }
  /* Routine to check for presence of dwarves */
  function dCheck() {
    for (let i = 0; i < (DWARFMAX - 1); i++) {
      if (g.dLoc[i] == g.loc)
        return i+1; /* careful - dwarf 0 must not return 0 */
    }
    return 0;
  }

  /* Determine liquid in the bottle */
  function liq() {
    let i = prop("BOTTLE");
    let j = -1 - i;
    return liq2(i > j ? i : j);
  }

  /* Determine liquid at a location */
  function liqLoc(loc) {
    if (lcond(loc, LIQUID)) return liq2(lcond(loc, WATOIL));
    return liq2(1);
  }

  /* Convert  0 to WATER
  	      1 to nothing
    	      2 to OIL */
  function liq2(pbottle) {
    return objectify((1 - pbottle) * oidx("WATER") + (pbottle >> 1) * (oidx("WATER") + oidx("OIL")));
  }

  /* Fatal error routine */
  function bug(n) {
    printf("Fatal error number %d\n", n);
    stopGame = 1;
  }
   
  /* Recover stringified data from local storage */
  function storageClean(s) {
    return s.replace(/(^")|(\\")/g, function(p1,p2) {
      if (p1) return "";
      return "\"";
    });
  }

  async function checkLocalStorage(fromInit = false) {
    gameReady |= 16;
    if (typeof(Storage) === 'undefined') {
      copySettings(T, S, false);
      return;
    }
    hasLocalStorage = true;
    if (!fromInit) return;
    gameReady &= ~16;
    if (localStorage.hasOwnProperty(helper) && localStorage.hasOwnProperty(setter)) {
      wipe(S);
      let t1 = localStorage.getItem(helper);
      H = JSON.parse(storageClean(t1));
      let t2 = localStorage.getItem(setter);
      S = JSON.parse(storageClean(t2));
      for (let x in T) {
        if (typeof S[x] === 'undefined') S[x] = T[x];
        else if (T[x] != S[x]) { /* make sure displayed settings match actual settings */
          let el = document.getElementById(x);
          if (el.type == "checkbox") {
            el.checked = ((S[x] != 0) ? "true" : void(0));
          }
          else el.setAttribute("value", S[x]);
        }
      }
      H.gameId++;
      g.gameId = H.gameId;
      saveHelper();
      gameReady |= 16;
    }
    else {
      H.gameId++;
      g.gameId = H.gameId;
      saveHelper();
      copySettings(T, S, false);
      saveSettings();
      gameReady |= 16;
    }
  }
  function stopDemo() {
    clearInterval(demoMode);
    demoMode = 0;
    copySettings(T, S);
  }
  function startDemo() {
    if (demoActions.length < 100) return; /* sanity check */
    stopGame = 1;
    initState |= 2;
    copySettings(S, T);
    S.alwaysSpawnPirate = 1;
    S.allowEarlyMagic = 1;
    S.easyClosing = 1;
    demoMode = setInterval(playDemo, 20);
    restartGame();
  }

  var demoTurn = (function() {
    var turn = 0;
    return function(b) {
      turn = b || turn + 1;
      return turn;
    };
  })();
  function playDemo() {
    if (expectInput < 1) return;
    if (stopGame > g.turns) return;
    if (expectInput == 3) {
      keyReacter({key: "Demo"});
      return;
    }
    if ((!g.turns) && (!commandList.length)) commandList.push("razzle dazzle root beer");
    if ((g.turns < 2) && (expectInput == 2)) demoTurn(-1);
    if (expectInput == 1) {
      if (toting("AXE") && (g.dFlag >= 2) && dCheck()) {
        feedInput("toss axe");
        return;
      }
      else if (at("AXE")) {
        feedInput("get axe");
        return;
      }
    }
    let nextTurn = demoTurn();
    if (demoAlert) {
      demoAlert = false;
      nextTurn = demoTurn(nextTurn - 2);
    }
    if ((nextTurn >= demoActions.length) || 
        ((expectInput == 2) && (nextTurn > 1) && (demoActions[nextTurn] != 'y'))) {
      stopDemo();
      return;
    }
    feedInput(demoActions[nextTurn]);
  }

  function initPlay() {
    /* initialize ccSizer first */
    for (let i = 0; i < 10; i++) {
      if (i) ccSizer.innerHTML += "<br>";
      ccSizer.innerHTML += "0123456789012345678901234567890123456789";
    }
    sizeCalc();
    ["resize","visibilitychange"].forEach((a) => {
      window.addEventListener(a, sizeCalc); });
    /* Samsung Internet's dark mode makes the page unreadable unless we do this */
    if (navigator.userAgent.match(/SamsungBrowser/i)) {
      document.documentElement.style.setProperty("--text-color", "#fff");
    }
    printf("Initializing... please wait\n");
    gameReady = 0;
    iniGameState();
    iniSettings();
    iniLocs();
    iniWordList();
    iniItems();
    iniActMsg();
    iniMsgs();
    iniOptions();
    gKeys = Object.keys(g).slice();
    gKeys.sort();
    gameStarter = setInterval(isGameReady, 50);
  }

  function isGameReady() {
    if (gameReady < 0) {
      printf("Initialization failed - error %d", gameReady);
      clearInterval(gameStarter);
    } else if ((gameReady == gameBits) && (document.readyState === 'complete')) {
      clearInterval(gameStarter);
      startPlay();
    }
  }

  function isInStack(e, id) {
    let t = e.target;
    do {
      if (t.id == id) return true;
      t = t.parentNode;
    } while (t.parentNode);
  }

  function startPlay() /* to start when gameReady */ {
    cls();
    if (!(initState & 1)) {
      initState |= 1;
      document.addEventListener("keydown", keyReacter);
      window.addEventListener("beforeunload", unloadResponder);
      ccInput.addEventListener("input", inputReacter);
      ccInput.addEventListener("paste", pasteReacter);
      document.addEventListener("click", (e) => {
        if (!e.target) return;
        if (expectInput == 3) {
          keyReacter({"key": "Enter"});
        }
        else if (isInStack(e, "ccbutton-Defaults")) {
          if (expectInput != 5) return;
          for (let o of optList) {
            if (T[o.name] != o.default) {
              if (o.type == "checkbox") document.getElementById(o.name).click();
              else {
                let ctx = document.getElementById(o.name);
                ctx.value = o.default;
                ctx.setAttribute("value", o.default);
                settingsReacter({"target": ctx});
              }
            }     
          }
        }
        else if (isInStack(e, "ccbutton-Cancel")) {
          if (expectInput != 5) return;
          for (let i in T) {
            if (S[i] != T[i]) {
              let ctx = document.getElementById(i);
              if (ctx.type == "checkbox") ctx.click();
              else {
                ctx.value = S[i];
                ctx.setAttribute("value", S[i]);
                settingsReacter({"target": ctx});
              }
            }     
          }
        }
        else if (isInStack(e, "ccbutton-Apply")) {
          openSettings();
        }
        else if (isInStack(e, "gearIcon")) openSettings();
        else if (isInStack(e, "about")) {
          if (expectInput == 1) feedInput("about");
          else if ((expectInput == 2) && (!g.turns)) {
            feedInput("y");
            disableInput(3);
            yesHandler = () => { requestInput(); feedInput("about"); };
          }
        }
        else if (isInStack(e, "mobicon-0")) {
          if ((!expectInput) || (expectInput > 2)) return;
          keyReacter({"key": "ArrowLeft"});
        }
        else if (isInStack(e, "mobicon-1")) {
          if ((!expectInput) || (expectInput > 2)) return;
          keyReacter({"key": "ArrowUp"});
        }
        else if (isInStack(e, "mobicon-2")) {
          if ((!expectInput) || (expectInput > 2)) return;
          keyReacter({"key": "ArrowRight"});
        }
        else if (isInStack(e, "mobicon-3")) {
          if ((!expectInput) || (expectInput > 2)) return;
          keyReacter({"key": "ArrowDown"});
        }
        else if (isInStack(e, "mobicon-5")) {
          if ((!expectInput) || (expectInput > 2)) return;
          keyReacter({"key": "PageDown"});
        }
        else if ((expectInput == 1) || (expectInput == 2)) {
          if (((g.turns < 2) && (wTracker.x < 600)) || (e.detail === 2)) keyReacter({"key": "End"});
        }
      });
      if (S.noFlicker) {
        ccCursor.classList.add("noflicker");
      }
      if (S.allCaps) {
        document.getElementById("playarea").style.textTransform = "uppercase";
      }
      if (S.problemBrowser == assumeProblemBrowser) toggleMargin(0);
      rSpeak(218);
    }
    else { /* on init this is done by checkLocalStorage 
            * (only if storage exists, but we can't track
            * gameId with no storage anyway...) */
      H.gameId++;
      g.gameId = H.gameId;
      saveHelper();
    }
    if (S.useTimer) onTimer();
    stopGame = 0;
    yes(65, 1, 0, function(a) {
      g.hints = a ? 5 : 0;
      g.limit = a ? 1000 : 330;
      turn();
    });
  }

  function restartGame() {
    if (!stopGame) {
      yes(202, 54, 54, restartPlay);
    }
    else restartPlay(true);
    function restartPlay(yea = true) {
      saveFlg = 0;
      if (!yea) { 
        requestInput();
        return;
      }
      itemKeys.length = 0;
      commandList.length = 0;
      wipe(itemList);
      iniGameState();
      gameReady = gameBits - 2;
      iniItems();
      for (let l of locList) { /* unvisit all locations */
         l.visited = 0;
      }
      gameStarter = setInterval(isGameReady, 50);
    }
  }

  /* ********** PARSER UTILITIES *********** */
  function wordType(a) {
    b = (typeof(a) === 'number') ? a : analyze(a);
    return b ? Math.floor((b + 0.5) / 1000) : -1;
  }

  /* Analyze a two word sentence */
  function english() {
    let wval1 = 0,
      wval2 = 0,
      type1, type2, val1, val2;

    verb = object = motion = 0;
    type2 = val2 = -1;
    type1 = val1 = -1;
    msg = "bad grammar...";

    getWords();

    if (!word1) return 0; /* ignore whitespace */
    wval1 = analyze(word1);
    if (!wval1) /* check word1 */
      return 0; /* didn't know it */

    val1 = wval1 % 1000;
    type1 = wordType(wval1);

    if (stopGame) {
      if ((type1 != VERB) || (val1 != v("restart"))) {
        rSpeak(203);
        return 0;
      }
    }

    if (type1 == VERB && val1 == v("say")) {
      verb = "say"; /* repeat word & act upon if.. */
      object = 1;
      return 1;
    }

    if (word2) {
      wval2 = analyze(word2);
      if (!wval2) return 0; /* didn't know it */
    }

    if (wval2) {
      val2 = wval2 % 1000;
      type2 = wordType(wval2);
    }

    /* check grammar */
    if ((type1 == OTHER) && (type2 == OTHER) &&
      (val1 == 51) && (val2 == 51)) { /* help help */
      outWords();
      return 0;
    } else if ((type1 == OTHER) && (val1 == 216)) {
      doAbout();
      return 1;
    }
      else if (type1 == OTHER) {
      rSpeak(val1);
      return 0;
    } else if (type2 == OTHER) {
      rSpeak(val2);
      return 0;
    } else if (type1 == MOTION) {
      if (type2 == MOTION) {
        printf("%s\n", msg);
        return 0;
      } else
        motion = val1;
    } else if (type2 == MOTION)
      motion = val2;
    else if (type1 == NOUN) {
      objectSet(val1);
      if (type2 == VERB)
        verb = val2;
      if (type2 == NOUN) {
        printf("%s\n", msg);
        return 0;
      }
    } else if (type1 == VERB) {
      verb = val1;
      if (type2 == NOUN)
        objectSet(val2);
      if (type2 == VERB) {
        printf("%s\n", msg);
        return 0;
      }
    } else
      bug(36);
    return 1;
  }

  /* Routine to analyze a word */
  function analyze(a) {
    var wordval = vocab(a, 0);
    var msg;

    /* make sure I understand */
    if (wordval == -1) {
      switch (rand(3)) {
        case 0:
          msg = 60;
          break;
        case 1:
          msg = 61;
          break;
        default:
          msg = 13;
      }
      rSpeak(msg);
      return 0;
    }
    return wordval;
  }

  /* convert input to lowercase, remove fluff and scan for first two words
   * (max wordLength chars) */
  function getWords() {
    word1 = word2 = "";
    if (!textInput) {
      flushInput();
      return;
    }
    textClean();
    if (textInput.match(/^razzle dazzle root beer$/i)) {
      flushInput();
      disableInput();
      if (!(initState & 2)) iniDemo();
      else startDemo();
    }
    else if (textInput.match(/^big phony$/i)) {
      flushInput();
      if (dbugFlg = !dbugFlg) rSpeak(215);
      else rSpeak(54);
      return;
    }
    const tempArray = textInput.split(" ");
    flushInput(true);
    if (!tempArray.length) return; /* paranoia */
    let wordLength = S.shortWords ? 5 : 20;
    word1 = tempArray[0].slice(0, wordLength);
    if (tempArray.length > 1) word2 = tempArray[1].slice(0, wordLength);
    if (dbugFlg) printf("WORD1 = %s, WORD2 = %s\n", word1, word2);
  }

  /* output adventure word list (motion/0xxx & verb/2xxx) 
   * only 6 words/line
   * unlike original, no pause after 20 lines */
  function outWords() {
    var j = 0;
    let arr = [];
    weirdBreaksMode = 1;
    function arrText() {
      return "%-12s".repeat(arr.length);
    }
    for (let i in wordList) {
      let p = (typeof(wordList[i]) === 'object') ? vocab(wordList[i], 0) : wordList[i];
      if (isMotion(p) || isVerb(p)) {
        if (i == "gimme") continue;
        arr.push(i);
        if (arr.length == 6) {
          printf(arrText(), ...arr);
          addResponsiveLineBreak();
          arr.length = 0;
        }
      }
    }
    if (arr.length) printf(arrText(), ...arr);
    weirdBreaksMode = 0;
  }

  /* display information about the game */
  function doAbout() {
    disableInput(3);
    rSpeak(216);
    scroll();
    yesHandler = () => { disableInput(3); rSpeak(217); requestInput(); };
  }

  /* ********** VERB UTILITIES *********** */
  function v(a) {
    b = wordList[a];
    if (!b) return -1;
    if ((typeof b) === "object") {
      let i = -1;
      for (let j = 0;
        ((j < b.length) && (i < 0)); j++) {
        if ((b[j] >= 2000) && (b[j] < 3000)) i = (b[j] - 2000);
      }
      return i;
    }
    return b - 2000;
  }

  /* Routine to process a transitive verb */
  function trVerb() {
    switch (verb) {
      case v("calm"):
      case v("walk"):
      case v("quit"):
      case v("score"):
      case v("foo"):
      case v("brief"):
      case v("hours"):
      case v("log"):
        actSpeak(verb);
        break;
      case v("take"):
      case v("gimme"): /* debug take - acquire object */
        vTake();
        break;
      case v("drop"):
        vDrop();
        break;
      case v("open"):
      case v("lock"):
        vOpen();
        break;
      case v("say"):
        vSay();
        break;
      case v("nothing"):
        rSpeak(54);
        break;
      case v("on"):
        vOn();
        break;
      case v("off"):
        vOff();
        break;
      case v("wave"):
        vwave();
        break;
      case v("kill"):
        vKill();
        break;
      case v("pour"):
        vPour();
        break;
      case v("eat"):
        vEat();
        break;
      case v("drink"):
        vDrink();
        break;
      case v("rub"):
        if (object != "LAMP")
          rSpeak(76);
        else
          actSpeak(v("rub"));
        break;
      case v("throw"):
        vThrow();
        break;
      case v("feed"):
        vFeed();
        break;
      case v("find"):
      case v("i"):
        vFind();
        break;
      case v("fill"):
        vFill();
        break;
      case v("read"):
        vRead();
        break;
      case v("blast"):
        vBlast();
        break;
      case v("break"):
        vBreak();
        break;
      case v("wake"):
        vWake();
        break;
      case v("save"):
      case v("load"):
      case v("delete"):
      case v("restart"):
        itVerb();
        break; 
      default:
        printf("This verb is not implemented yet.\n");
    }
  }

  /* CARRY, TAKE etc. */
  function vTake() {
    if (toting(object)) {
      actSpeak(verb);
      return;
    }
    var msg = 25,
      i;
    /* special case objects and fixed objects */
    if (object == "PLANT" && prop("PLANT") <= 0)
      msg = 115;
    if (object == "BEAR" && prop("BEAR") == 1)
      msg = 169;
    if ((object == "CHAIN") && (prop("BEAR") < 2) && (!S.allowEarlyChain))
      msg = 170;
    if ((fixed(object)) || (msg == 170)) {
      rSpeak(msg);
      return;
    }
    /* special case for liquids */
    if (object == "WATER" || object == "OIL") {
      if (!here("BOTTLE") || liq() != object) {
        object = "BOTTLE";
        if (toting("BOTTLE") && prop("BOTTLE") == 1) {
          vFill();
          return;
        }
        if (prop("BOTTLE") != 1)
          msg = 105;
        if (!toting("BOTTLE"))
          msg = 104;
        rSpeak(msg);
        return;
      }
      object = "BOTTLE";
    }
    if (g.holding >= 7) {
      rSpeak(92);
      return;
    }
    /* special case for bird. */
    if (object == "BIRD" && !prop("BIRD")) {
      if (toting("ROD")) {
        rSpeak(26);
        return;
      }
      if (!toting("CAGE")) {
        rSpeak(27);
        return;
      }
      propSet("BIRD", 1);
    }
    if ((object == "BIRD" || object == "CAGE") && prop("BIRD") != 0)
      carry((object == "BIRD") ? "CAGE" : "BIRD", g.loc);
    carry(object, g.loc);
    /* handle liquid in bottle */
    i = liq();
    if (object == "BOTTLE" && i != 0)
      placeSet(i, -1);
    rSpeak(54);
  }

  /* DROP etc. */
  function vDrop() {
    /* check for dynamite */
    if (toting("ROD2") && object == "ROD" && !toting("ROD"))
      object = "ROD2";
    if (!toting(object)) {
      actSpeak(verb);
      return;
    }
    /* snake and bird */
    if (object == "BIRD" && here("SNAKE")) {
      rSpeak(30);
      if (g.closed)
        dwarfend();
      dstroy("SNAKE");
      propSet("SNAKE", -1);
    }
    /* coins and vending machine */
    else if (object == "COINS" && here("VEND")) {
      dstroy("COINS");
      drop("BATTERIES", g.loc);
      pSpeak("BATTERIES", 0);
      return;
    }
    /* bird and dragon (ouch!!) */
    else if (object == "BIRD" && at("DRAGON") && !prop("DRAGON")) {
      rSpeak(154);
      dstroy("BIRD");
      propSet("BIRD", 0);
      if (place("SNAKE") != 0)
        ++g.tally2;
      return;
    }
    /* Bear and troll */
    if (object == "BEAR" && at("TROLL")) {
      rSpeak(163);
      move("TROLL", 0);
      move(bumpid("TROLL"), 0);
      move("TROLL2", 117);
      move(bumpid("TROLL2"), 122);
      juggle("CHASM");
      propSet("TROLL", 2);
    }
    /* vase and pillow */
    else if (object == "VASE") {
      if (g.loc == 96)
        rSpeak(54);
      else {
        propSet("VASE", at("PILLOW") ? 0 : 2);
        pSpeak("VASE", prop("VASE") + 1);
        if (prop("VASE") != 0)
          fixedSet("VASE", -1);
      }
      drop(object, g.loc);
      return;
    }
    /* handle liquid and bottle */
    let i = liq();
    if (i == object)
      object = "BOTTLE";
    if (object == "BOTTLE" && i != 0)
      placeSet(i, 0);
    /* handle bird and cage */
    if (object == "CAGE" && prop("BIRD") != 0)
      drop("BIRD", g.loc);
    if (object == "BIRD")
      propSet("BIRD", 0);
    drop(object, g.loc);
    rSpeak(54);
  }

  /* OPEN, CLOSE, LOCK, UNLOCK etc. */
  function vOpen() {
    var msg;

    switch (object) {
      case "CLAM":
      case "OYSTER":
        let oyclam = (object == "OYSTER" ? 1 : 0);
        if (verb == v("lock"))
          msg = 61;
        else if (!toting("TRIDENT"))
          msg = 122 + oyclam;
        else if (toting(object))
          msg = 120 + oyclam;
        else {
          msg = 124 + oyclam;
          dstroy("CLAM");
          drop("OYSTER", g.loc);
          drop("PEARL", 105);
        }
        break;
      case "DOOR":
        msg = ((prop("DOOR") == 1) ? 54 : 111);
        break;
      case "CAGE":
        msg = 32;
        break;
      case "KEYS":
        msg = 55;
        break;
      case "CHAIN":
        if (!here("KEYS"))
          msg = 31;
        else if (verb == v("lock")) {
          if (prop("CHAIN") != 0)
            msg = 34;
          else if (g.loc != 130)
            msg = 173;
          else {
            propSet("CHAIN", 2);
            if (toting("CHAIN"))
              drop("CHAIN", g.loc);
            fixedSet("CHAIN", -1);
            msg = 172;
          }
        } else {
          if (!prop("BEAR"))
            msg = 41;
          else if (!prop("CHAIN"))
            msg = 37;
          else {
            stateSet("CHAIN", 0, 0);
            if (prop("BEAR") != 3)
              propSet("BEAR", 2);
            fixedSet("BEAR", 2 - prop("BEAR"));
            msg = 171;
          }
        }
        break;
      case "GRATE":
        if (!here("KEYS"))
          msg = 31;
        else if (g.closing) {
          panic();
          msg = 130;
        } else {
          msg = 34 + prop("GRATE");
          propSet("GRATE", (verb == v("lock") ? 0 : 1));
          msg += 2 * prop("GRATE");
        }
        break;
      default:
        msg = 33;
    }
    rSpeak(msg);
  }

  /* SAY etc. */
  function vSay() {
    var wval = analyze(word1);
    printf("Okay.\n%s\n", (wval == (v("say") + 2000)) ? word2 : word1);
  }

  /* ON etc. */
  function vOn(v) {
    if (!here("LAMP"))
      actSpeak(verb);
    else if (g.limit < 0)
      rSpeak(184);
    else {
      propSet("LAMP", 1);
      rSpeak(39);
      if (g.wzDark) {
        g.wzDark = 0;
        describe();
      }
    }
  }

  /* OFF etc. */
  function vOff() {
    if (!here("LAMP"))
      actSpeak(verb);
    else {
      propSet("LAMP", 0);
      rSpeak(40);
    }
  }

  /* WAVE etc. */
  function vwave() {
    if (!toting(object) && (object != "ROD" || !toting("ROD2")))
      rSpeak(29);
    else if (object != "ROD" || !at("FISSURE") || !toting(object) || g.closing)
      actSpeak(verb);
    else {
      propSet("FISSURE", 1 - prop("FISSURE"));
      pSpeak("FISSURE", 2 - prop("FISSURE"));
    }
  }

  /* ATTACK, KILL etc. */
  function vKill() {
    let i, msg;

    switch (object) {
      case "BIRD":
        if (g.closed)
          msg = 137;
        else {
          dstroy("BIRD");
          prop("BIRD", 0);
          if (place("SNAKE", 19))
            ++g.tally2;
          msg = 45;
        }
        break;
      case 0:
        msg = 44;
        break;
      case "CLAM":
      case "OYSTER":
        msg = 150;
        break;
      case "SNAKE":
        msg = 46;
        break;
      case "DWARF":
        if (g.closed)
          dwarfend();
        msg = 49;
        break;
      case "TROLL":
        msg = 157;
        break;
      case "BEAR":
        msg = 165 + Math.floor((prop("BEAR") + 1.1) / 2);
        break;
      case "DRAGON":
        if (prop("DRAGON") != 0) {
          msg = 167;
          break;
        }
        yes(49, 0, 0, function(a) {
          if (!a) return;
          pSpeak("DRAGON", 1);
          propSet("DRAGON", 2);
          propSet("RUG", 0);
          move(bumpid("DRAGON"), -1);
          move(bumpid("RUG"), 0);
          move("DRAGON", 120);
          move("RUG", 120);
          itemList.forEach((a) => {
            if (a.loc == 119 || a.loc == 121) a.loc = 120;
          });
          g.newLoc = 120;
        });
        return;
      default:
        actSpeak(verb);
        return;
    }
    rSpeak(msg);
  }

  /* POUR */
  function vPour() {
    if (object == "BOTTLE" || object == 0)
      object = liq();
    if (object == 0) {
      needObj();
      return;
    }
    if (!toting(object)) {
      actSpeak(verb);
      return;
    }
    if (object != "OIL" && object != "WATER") {
      rSpeak(78);
      return;
    }
    propSet("BOTTLE", 1);
    placeSet(object, 0);
    if (at("PLANT")) {
      if (object != "WATER")
        rSpeak(112);
      else {
        pSpeak("PLANT", prop("PLANT") + 1);
        propSet("PLANT", (prop("PLANT") + 2) % 6);
        propSet("PLANT2", Math.floor(prop("PLANT") / 2));
        describe();
      }
    } else if (at("DOOR")) {
      propSet("DOOR", (object == "OIL" ? 1 : 0));
      rSpeak(113 + prop("DOOR"));
    } else
      rSpeak(77);
  }

  /* EAT */
  function vEat(v) {
    var msg;

    switch (object) {
      case "FOOD":
        dstroy("FOOD");
        msg = 72;
        break;
      case "BIRD":
      case "SNAKE":
      case "CLAM":
      case "OYSTER":
      case "DWARF":
      case "DRAGON":
      case "TROLL":
      case "BEAR":
        msg = 71;
        break;
      default:
        actSpeak(verb);
        return;
    }
    rSpeak(msg);
  }

  /* DRINK */
  function vDrink() {
    if (object != "WATER")
      rSpeak(110);
    else if (liq() != "WATER" || !here("BOTTLE"))
      actSpeak(verb);
    else {
      propSet("BOTTLE", 1);
      placeSet("WATER", 0);
      rSpeak(74);
    }
  }

  /* THROW etc. */
  function vThrow() {
    if (toting("ROD2") && object == "ROD" && !toting("ROD"))
      object = "ROD2";
    if (!toting(object)) {
      actSpeak(verb);
      return;
    }
    /* treasure to troll */
    if (at("TROLL") && isTreasure(object)) {
      rSpeak(159);
      drop(object, 0);
      move("TROLL", 0);
      move(bumpid("TROLL"), 0);
      drop("TROLL2", 117);
      drop(bumpid("TROLL2"), 122);
      juggle("CHASM");
      if ((object == "TRIDENT") && (!place("PEARL")) && (prop("PEARL") < 0)) {
        g.tally2++;
      }
      return;
    }
    /* feed the bears... */
    if (object == "FOOD" && here("BEAR")) {
      object = "BEAR";
      vFeed();
      return;
    }
    /* if not axe, same as drop... */
    if (object != "AXE") {
      vDrop();
      return;
    }
    let msg, i;
    /* "AXE" is THROWN */
    /* at a dwarf... */
    if ((i = dCheck())) {
      msg = 48;
      i--;
      if (pml(S.axeHitPml)) {
        g.dSeen[i] = g.dLoc[i] = 0;
        msg = 47;
        ++g.dKill;
        if (g.dKill == 1)
          msg = 149;
      }
    }
    /* at a dragon... */
    else if (at("DRAGON") && !prop("DRAGON"))
      msg = 152;
    /* at the troll... */
    else if (at("TROLL"))
      msg = 158;
    /* at the bear... */
    else if (here("BEAR") && !prop("BEAR")) {
      rSpeak(164);
      drop("AXE", g.loc);
      stateSet("AXE", 1, -1);
      juggle("BEAR");
      return;
    }
    /* otherwise it is an attack */
    else {
      verb = v("kill");
      object = 0;
      itVerb();
      return;
    }
    /* handle the left over axe... */
    rSpeak(msg);
    drop("AXE", g.loc);
    describe();
  }

  /* INVENTORY, FIND etc. */
  function vFind() {
    var msg;

    if (toting(object))
      msg = 24;
    else if (g.closed)
      msg = 138;
    else if (dCheck() && g.dFlag >= 2 && object == "DWARF")
      msg = 94;
    else if (at(object) || (liq() == object && here("BOTTLE")) || object == liqLoc(g.loc))
      msg = 94;
    else {
      actSpeak(verb);
      return;
    }
    rSpeak(msg);
  }

  /* FILL */
  function vFill() {
    let msg, i;

    switch (object) {
      case "BOTTLE":
        if (liq() != 0)
          msg = 105;
        else if (liqLoc(g.loc) == 0)
          msg = 106;
        else {
          propSet("BOTTLE", lcond(g.loc, WATOIL));
          i = liq();
          if (toting("BOTTLE"))
            placeSet(i, -1);
          msg = (i == "OIL" ? 108 : 107);
        }
        break;
      case "VASE":
        if (liqLoc(g.loc) == 0) {
          msg = 144;
          break;
        }
        if (!toting("VASE")) {
          msg = 29;
          break;
        }
        rSpeak(145);
        vDrop();
        return;
      default:
        msg = 29;
    }
    rSpeak(msg);
  }

  /* FEED */
  function vFeed() {
    let msg;

    switch (object) {
      case "BIRD":
        msg = 100;
        break;
      case "DWARF":
        if (!here("FOOD")) {
          actSpeak(verb);
          return;
        }
        ++g.dFlag;
        msg = 103;
        break;
      case "BEAR":
        if (!here("FOOD")) {
          if (!prop("BEAR"))
            msg = 102;
          else if (prop("BEAR") == 3)
            msg = 110;
          else {
            actSpeak(verb);
            return;
          }
          break;
        }
        dstroy("FOOD");
        propSet("BEAR", 1);
        stateSet("AXE", 0, 0);
        msg = 168;
        break;
      case "DRAGON":
        msg = (prop("DRAGON") != 0 ? 110 : 102);
        break;
      case "TROLL":
        msg = 182;
        break;
      case "SNAKE":
        if (g.closed || !here("BIRD")) {
          msg = 102;
          break;
        }
        msg = 101;
        dstroy("BIRD");
        propSet("BIRD", 0);
        ++g.tally2;
        break;
      default:
        msg = 14;
    }
    rSpeak(msg);
  }

  /* READ etc. */
  function vRead() {
    var msg;

    msg = 0;
    if (dark()) {
      printf("I see no %s here.\n", prObj(object));
      return;
    }
    switch (object) {
      case "MAGAZINE":
        msg = 190;
        break;
      case "TABLET":
        msg = 196;
        break;
      case "MESSAGE":
        msg = 191;
        break;
      case "OYSTER":
        if (!toting("OYSTER") || !g.closed)
          break;
        yes(192, 193, 54);
        return;
      default:
        ;
    }
    if (msg)
      rSpeak(msg);
    else
      actSpeak(verb);
  }

  /* BLAST etc. */
  function vBlast() {
    if (prop("ROD2") < 0 || !g.closed)
      actSpeak(verb);
    else {
      g.bonus = 133;
      if (g.loc == 115)
        g.bonus = 134;
      if (here("ROD2"))
        g.bonus = 135;
      rSpeak(g.bonus);
      normEnd();
    }
  }

  /* BREAK etc. */
  function vBreak() {
    var msg;

    if (object == "MIRROR") {
      msg = 148;
      if (g.closed) {
        rSpeak(197);
        dwarfend();
      }
    } else if (object == "VASE" && !prop("VASE")) {
      msg = 198;
      if (toting("VASE"))
        drop("VASE", g.loc);
      stateSet("VASE", 2, -1);
    } else {
      actSpeak(verb);
      return;
    }
    rSpeak(msg);
  }

  /* WAKE etc. */
  function vWake() {
    if (object != "DWARF" || !g.closed)
      actSpeak(verb);
    else {
      rSpeak(199);
      dwarfend();
    }
  }

  /* Routine to speak default verb message */
  function actSpeak(vb) {
    if (vb < 1 || vb >= actMsg.length)
      bug(39);
    let i = actMsg[vb];
    if (i)
      rSpeak(i);
  }

  /* Routine to indicate no reasonable
   * object for verb found.  Used mostly by
   * intransitive verbs */
  function needObj() {
    printf("%s what?\n", isVerb(word1) ? word1 : word2);
  }

  /* Routines to process intransitive verbs */
  function itVerb() {
    switch (verb) {
      case v("drop"):
      case v("say"):
      case v("wave"):
      case v("calm"):
      case v("rub"):
      case v("throw"):
      case v("find"):
      case v("feed"):
      case v("break"):
      case v("wake"):
        needObj();
        break;
      case v("take"):
        ivTake();
        break;
      case v("open"):
      case v("lock"):
        ivOpen();
        break;
      case v("nothing"):
        rSpeak(54);
        break;
      case v("on"):
      case v("off"):
      case v("pour"):
        trVerb();
        break;
      case v("walk"):
        actSpeak(verb);
        break;
      case v("kill"):
        ivKill();
        break;
      case v("eat"):
        ivEat();
        break;
      case v("drink"):
        ivDrink();
        break;
      case v("quit"):
        ivQuit();
        break;
      case v("fill"):
        ivFill();
        break;
      case v("blast"):
        vBlast();
        break;
      case v("score"):
        score();
        break;
      case v("foo"):
        ivFoo();
        break;
      case v("save"):
        saveFlg = 1;
        break;
      case v("restart"):
        saveFlg = 5;
        break;
      case v("delete"):
        saveFlg = 7;
        break;
      case v("inventory"):
        inventory();
        break;
      case v("load"):
        saveFlg = 3;
        break;
      default:
        printf("This intransitive not implemented yet\n");
    }
  }

  /* CARRY, TAKE etc. */
  function ivTake() {
    let anobj = 0;

    /* Check whether there's exactly 1 pickable item */
    itemList.forEachName((a) => {
      if (place(a) == g.loc) {
        if (anobj != 0) {
          needObj();
          return;
        }
        anobj = a;
      }
    });
    if (!anobj || (dCheck() && g.dFlag >= 2)) {
      needObj();
      return;
    }
    object = anobj;
    vTake();
  }

  /* OPEN, LOCK, UNLOCK */
  function ivOpen() {
    if (here("CLAM"))
      object = "CLAM";
    if (here("OYSTER"))
      object = "OYSTER";
    if (at("DOOR"))
      object = "DOOR";
    if (at("GRATE"))
      object = "GRATE";
    if (here("CHAIN")) {
      if (object != 0) {
        needObj();
        return;
      }
      object = "CHAIN";
    }
    if (object == 0) {
      rSpeak(28);
      return;
    }
    vOpen();
  }

  /* ATTACK, KILL etc */
  function ivKill() {
    object1 = 0;
    if (dCheck() && g.dFlag >= 2)
      object = "DWARF";
    if (here("SNAKE"))
      addObj("SNAKE");
    if (at("DRAGON") && !prop("DRAGON"))
      addObj("DRAGON");
    if (at("TROLL"))
      addObj("TROLL");
    if (here("BEAR") && !prop("BEAR"))
      addObj("BEAR");
    if (object1 != 0) {
      needObj();
      return;
    }
    if (object != 0) {
      vKill();
      return;
    }
    if (here("BIRD") && verb != v("THROW"))
      object = "BIRD";
    if (here("CLAM") || here("OYSTER"))
      addObj("CLAM");
    if (object1 != 0) {
      needObj();
      return;
    }
    vKill();
  }

  /* EAT */
  function ivEat() {
    if (!here("FOOD"))
      needObj();
    else {
      object = "FOOD";
      vEat();
    }
  }

  /* DRINK */
  function ivDrink() {
    if (liqLoc(g.loc) != "WATER" && (liq() != "WATER" || !here("BOTTLE")))
      needObj();
    else {
      object = "WATER";
      vDrink();
    }
  }

  /* QUIT */
  function ivQuit() {
    yes(22, 54, 54, function(a) {
      g.gaveUp = a;
      if (g.gaveUp) normEnd();
    });
  }

  /* FILL */
  function ivFill() {
    if (!here("BOTTLE"))
      needObj();
    else {
      object = "BOTTLE";
      vFill();
    }
  }

  /* Handle fee fie foe foo... */
  function ivFoo() {
    var k, msg;

    k = vocab(word1, 3000);
    msg = 42;
    if (g.foobar != 1 - k) {
      if (g.foobar != 0)
        msg = 151;
      rSpeak(msg);
      return;
    }

    g.foobar = k;
    if (k != 4)
      return;

    g.foobar = 0;
    if (place("EGGS") == 92 || (toting("EGGS") && g.loc == 92)) {
      rSpeak(msg);
      return;
    }

    if (!place("EGGS") && !place("TROLL") && !prop("TROLL"))
      propSet("TROLL", 1);
    if (here("EGGS"))
      k = 1;
    else if (g.loc == 92)
      k = 0;
    else
      k = 2;
    move("EGGS", 92);
    pSpeak("EGGS", k);
    return;
  }

  /* read etc... */
  /*  no room for this...
  ivRead() {
  	if (here("MAGAZINE"))
  		object = "MAGAZINE";
  	if (here("TABLET"))
  		object = "TABLET";
  	if (here("MESSAGE"))
  		object = "MESSAGE";
  	if (!oOk(object) || dark()) {
  		needObj();
  		return;
  	}
  	vRead();
  }
  */

  /* Display inventory */
  function inventory() {
    let i, msg = 98;
    itemList.forEachName((j) => {
      if (j == "BEAR" || !toting(j))
        return;
      if (msg)
        rSpeak(99);
      msg = 0;
      pSpeak(j, -1);
    });
    if (toting("BEAR"))
      msg = 141;
    if (msg)
      rSpeak(msg);
  }

  /* ensure uniqueness as objects are searched out for an intransitive verb */
  function addObj(obj) {
    if (object1 != 0)
      return;
    if (object != 0) {
      object1 = -1;
      return;
    }
    object = obj;
  }
  initPlay();
})(document);