// State Variables
let totalProtein = 0;
let userWeight = 80; // Default weight in kg
let lastProtein = null; // Stores last protein state for Undo (되돌리기)
let totalSets = 0; // Workout sets counter
let activeTab = 'protein'; // Active tab ('protein' or 'workout')
let defaultRestDuration = 120; // Default rest duration in seconds (2 minutes)
let restTimerStartDuration = 120; // Active timer total duration (including +30s)
let workoutStartTime = null; // Timestamp of first set added
let stopwatchInterval = null; // Stopwatch ticking interval
let stopwatchPaused = false; // Is the stopwatch currently paused?
let stopwatchElapsedMs = 0; // Accumulated elapsed milliseconds when paused
let lastSetTimestamp = null; // Timestamp of last completed set
let wakeLock = null; // Screen Wake Lock state
let restTimerEndTime = null; // Target end timestamp for rest timer
let audioCtx = null; // Persistent AudioContext for iOS Safari compatibility

// DOM Elements
const totalDisplay = document.getElementById('protein-total');
const customInput = document.getElementById('custom-amount');
const progressCircle = document.querySelector('.progress-ring-bar');
const resetBtn = document.getElementById('btn-reset');
const counterContainer = document.querySelector('.counter-display');
const weightInput = document.getElementById('weight-input');
const statusMessage = document.getElementById('status-message');
const targetRemaining = document.getElementById('target-remaining');
const maxRemaining = document.getElementById('max-remaining');
const widgetContainer = document.querySelector('.widget-container');
const targetLabel = document.getElementById('target-label');
const maxLabel = document.getElementById('max-label');
const undoBtn = document.getElementById('btn-undo');

// Workout DOM Elements
const setsDisplay = document.getElementById('sets-total');
const setsContainer = document.querySelector('.sets-counter-display');
const resetBtnSets = document.getElementById('btn-reset-sets');
const stopwatchDisplay = document.getElementById('stopwatch-display');
const stopwatchContainer = document.querySelector('.stopwatch-container');
const lastRestContainer = document.getElementById('last-rest-container');
const lastRestDisplay = document.getElementById('last-rest-time');

// Calculate Circle Properties
const CIRCLE_RADIUS = 76;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS; // 477.52

// Initialize App
function init() {
    // Load Protein from localStorage
    const savedTotal = localStorage.getItem('protein_total');
    if (savedTotal !== null) {
        totalProtein = parseInt(savedTotal, 10) || 0;
    }

    // Load Weight from localStorage
    const savedWeight = localStorage.getItem('user_weight');
    if (savedWeight !== null) {
        userWeight = parseInt(savedWeight, 10) || 80;
        // Migration: If weight was the old default of 70, upgrade to the new default of 80
        if (userWeight === 70) {
            userWeight = 80;
            localStorage.setItem('user_weight', 80);
        }
        weightInput.value = userWeight;
    } else {
        userWeight = 80;
        weightInput.value = userWeight;
    }

    // Load Sets from localStorage
    const savedSets = localStorage.getItem('workout_sets');
    if (savedSets !== null) {
        totalSets = parseInt(savedSets, 10) || 0;
    }

    // Load Active Tab from localStorage
    const savedTab = localStorage.getItem('active_tab');
    if (savedTab !== null) {
        activeTab = savedTab;
    }

    // Set Undo button state on load (disabled until first action)
    undoBtn.disabled = true;

    // Load Default Rest Duration from localStorage
    const savedDuration = localStorage.getItem('default_rest_duration');
    if (savedDuration !== null) {
        defaultRestDuration = parseInt(savedDuration, 10) || 120;
    }
    restTimeRemaining = defaultRestDuration;

    // Load Rest Timer End Time from localStorage
    const savedEndTime = localStorage.getItem('rest_timer_end_time');
    if (savedEndTime !== null) {
        restTimerEndTime = parseInt(savedEndTime, 10);
        if (restTimerEndTime > Date.now()) {
            startRestTimer(true);
        } else {
            localStorage.removeItem('rest_timer_end_time');
            localStorage.removeItem('rest_timer_start_duration');
            restTimerEndTime = null;
            updateTimerText();
        }
    } else {
        updateTimerText();
    }

    // Load Workout Start Time from localStorage
    const savedStartTime = localStorage.getItem('workout_start_time');
    const savedIsPaused = localStorage.getItem('workout_is_paused');
    if (savedStartTime !== null) {
        workoutStartTime = parseInt(savedStartTime, 10);
        if (savedIsPaused === 'true') {
            stopwatchPaused = true;
            stopwatchElapsedMs = parseInt(localStorage.getItem('workout_elapsed_ms'), 10) || 0;
            stopwatchContainer.classList.add('paused');
            updateStopwatchDisplayByMs(stopwatchElapsedMs);
        } else {
            stopwatchPaused = false;
            startStopwatch();
        }
    } else {
        stopwatchDisplay.textContent = '운동 시작';
    }

    // Load Last Set Timestamp & Formatted Rest Time
    const savedLastSetTimestamp = localStorage.getItem('last_set_timestamp');
    if (savedLastSetTimestamp !== null) {
        lastSetTimestamp = parseInt(savedLastSetTimestamp, 10);
    }
    const savedLastRestFormatted = localStorage.getItem('last_rest_formatted');
    if (savedLastRestFormatted !== null && lastSetTimestamp !== null) {
        // Only show if it was within the last 1 hour to prevent stale messages
        if (Date.now() - lastSetTimestamp < 3600000) {
            lastRestDisplay.textContent = savedLastRestFormatted;
            lastRestContainer.style.display = 'flex';
        } else {
            localStorage.removeItem('last_rest_formatted');
            localStorage.removeItem('last_set_timestamp');
            lastSetTimestamp = null;
        }
    }

    // Apply Active Tab and UI
    switchTab(activeTab);
    updateSetsUI(false);
    updateDurationSelectorUI();
}

// Switch between tabs (Protein / Workout Sets)
function switchTab(tabName) {
    activeTab = tabName;
    localStorage.setItem('active_tab', activeTab);
    
    // Update tab header button active styles
    document.getElementById('btn-tab-protein').classList.toggle('active', tabName === 'protein');
    document.getElementById('btn-tab-workout').classList.toggle('active', tabName === 'workout');
    
    // Toggle view containers visibility
    document.getElementById('view-protein').classList.toggle('active', tabName === 'protein');
    document.getElementById('view-workout').classList.toggle('active', tabName === 'workout');
    
    // Update container class for coloring
    if (tabName === 'workout') {
        widgetContainer.className = 'widget-container theme-sets';
    } else {
        // Force update protein UI to re-apply the correct protein color theme class
        updateUI(false);
    }
}

// Update Protein UI elements
function updateUI(triggerPop = true) {
    // Get valid weight (fallback to 70 if invalid)
    const weight = parseInt(weightInput.value, 10) || 70;

    // Calculate Thresholds
    const threshold1 = weight * 1.2; // 1.2x
    const threshold2 = weight * 1.4; // 1.4x (🎯 권장)
    const threshold3 = weight * 1.6; // 1.6x (⚡ 최적)
    const threshold4 = weight * 1.8; // 1.8x
    const threshold5 = weight * 2.0; // 2.0x
    const threshold6 = weight * 2.2; // 2.2x

    // Update target and max labels with calculated grams
    targetLabel.textContent = '🎯 권장 (1.4x) : ' + Math.round(threshold2) + 'g';
    maxLabel.textContent = '⚡ 최적 (1.6x) : ' + Math.round(threshold3) + 'g';

    // Update number display
    totalDisplay.textContent = totalProtein;

    // Trigger number pop animation
    if (triggerPop) {
        counterContainer.classList.add('pop');
        setTimeout(() => {
            counterContainer.classList.remove('pop');
        }, 200);
    }

    // Determine status text
    let statusText = '충전 중';
    if (totalProtein >= threshold6) {
        statusText = '괴물!! 🦍';
    } else if (totalProtein >= threshold5) {
        statusText = '선 넘네? ⚠️';
    } else if (totalProtein >= threshold4) {
        statusText = '진심? 😎';
    } else if (totalProtein >= threshold3) {
        statusText = '오늘 끝! 🎉';
    } else if (totalProtein >= threshold2) {
        statusText = '굿! 👍';
    } else if (totalProtein >= threshold1) {
        statusText = '오께이! 👌';
    }

    // Update status element
    statusMessage.textContent = statusText;

    // Apply color themes based on thresholds:
    widgetContainer.classList.remove(
        'theme-yellow', 'theme-green', 'theme-blue', 'theme-purple',
        'theme-pink', 'theme-orange', 'theme-red', 'theme-sets'
    );
    if (totalProtein < threshold1) {
        widgetContainer.classList.add('theme-yellow');
    } else if (totalProtein < threshold2) {
        widgetContainer.classList.add('theme-green');
    } else if (totalProtein < threshold3) {
        widgetContainer.classList.add('theme-blue');
    } else if (totalProtein < threshold4) {
        widgetContainer.classList.add('theme-purple');
    } else if (totalProtein < threshold5) {
        widgetContainer.classList.add('theme-pink');
    } else if (totalProtein < threshold6) {
        widgetContainer.classList.add('theme-orange');
    } else {
        widgetContainer.classList.add('theme-red');
    }

    // Update target and max display with remaining (-) or exceeded (+) values
    if (totalProtein > threshold2) {
        const exceeded = Math.round(totalProtein - threshold2);
        targetRemaining.textContent = '권장 초과 +' + exceeded + 'g';
        targetRemaining.classList.add('completed');
    } else {
        const remTarget = Math.round(threshold2 - totalProtein);
        targetRemaining.textContent = '권장까지 -' + remTarget + 'g';
        targetRemaining.classList.remove('completed');
    }

    if (totalProtein > threshold3) {
        const exceeded = Math.round(totalProtein - threshold3);
        maxRemaining.textContent = '최적 초과 +' + exceeded + 'g';
        maxRemaining.classList.add('completed');
    } else {
        const remMax = Math.round(threshold3 - totalProtein);
        maxRemaining.textContent = '최적까지 -' + remMax + 'g';
        if (remMax === 0) {
            maxRemaining.classList.add('completed');
        } else {
            maxRemaining.classList.remove('completed');
        }
    }

    // Update Progress Ring (completes at threshold3 / Max)
    const progressPercent = Math.min(totalProtein / threshold3, 1);
    const offset = CIRCLE_CIRCUMFERENCE - (progressPercent * CIRCLE_CIRCUMFERENCE);
    progressCircle.style.strokeDashoffset = offset;

    // Save to local storage for robustness
    localStorage.setItem('protein_total', totalProtein);
    localStorage.setItem('user_weight', weight);
}

// Add Protein Amount
function addProtein(amount) {
    if (amount === 0) return;
    
    // Save history state for undo before change
    lastProtein = totalProtein;
    undoBtn.disabled = false;

    totalProtein = Math.max(0, totalProtein + amount);
    updateUI(true);
    
    // Web Haptics (Vibration) if supported
    if (navigator.vibrate) {
        navigator.vibrate(amount < 0 ? [15, 30, 15] : 15);
    }
}

// Add Custom Protein Amount
function addCustomProtein() {
    const value = parseInt(customInput.value, 10);
    if (isNaN(value) || value <= 0) {
        customInput.style.animation = 'shake 0.3s ease-in-out';
        setTimeout(() => {
            customInput.style.animation = '';
        }, 300);
        return;
    }

    addProtein(value);
    customInput.value = '';
    customInput.blur(); // Dismiss mobile keyboard
}

// Revert last action on Protein Page (되돌리기)
function undoProtein() {
    if (lastProtein === null) return;
    
    totalProtein = lastProtein;
    lastProtein = null;
    undoBtn.disabled = true; // Disable undo until next action
    
    updateUI(true);
    
    if (navigator.vibrate) {
        navigator.vibrate([20, 10, 20]);
    }
}

// Reset confirmation state for Protein
let resetTimeout = null;
let isConfirmingReset = false;

function confirmReset() {
    if (!isConfirmingReset) {
        isConfirmingReset = true;
        resetBtn.classList.add('confirming');
        resetBtn.querySelector('span').textContent = '한번 더!';
        
        resetTimeout = setTimeout(() => {
            cancelResetState();
        }, 3000);
    } else {
        performReset();
    }
}

function cancelResetState() {
    isConfirmingReset = false;
    resetBtn.classList.remove('confirming');
    resetBtn.querySelector('span').textContent = '초기화';
    if (resetTimeout) {
        clearTimeout(resetTimeout);
        resetTimeout = null;
    }
}

function performReset() {
    // Save history for undo even on reset (optional, but lets user recover a reset!)
    lastProtein = totalProtein;
    undoBtn.disabled = false;

    totalProtein = 0;
    updateUI(true);
    cancelResetState();
    
    if (navigator.vibrate) {
        navigator.vibrate([30, 50, 30]);
    }
}

// Workout Sets - Timer Variables
const restTimerContainer = document.getElementById('rest-timer-container');
const restTimerDisplay = document.getElementById('rest-timer');
const restTimerTextDisplay = document.getElementById('rest-timer-text');
let restTimerInterval = null;
let restTimeRemaining = 120; // Starts at defaultRestDuration

// Save and format rest duration (Option A)
function saveRestDuration(seconds) {
    if (seconds <= 0) return;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const formattedRest = mins > 0 ? mins + '분 ' + secs + '초' : secs + '초';
    
    lastRestDisplay.textContent = formattedRest;
    lastRestContainer.style.display = 'flex';
    localStorage.setItem('last_rest_formatted', formattedRest);
    
    // Record timestamp of this rest completion
    lastSetTimestamp = Date.now();
    localStorage.setItem('last_set_timestamp', lastSetTimestamp);
}

// Workout Sets - Adjust Sets
function adjustSets(amount) {
    if (amount === 0) return;
    totalSets = Math.max(0, totalSets + amount);
    updateSetsUI(true);
    
    if (amount > 0) {
        // If a timer was currently running, save its elapsed time before starting a new one
        if (restTimerInterval) {
            const elapsedMs = (restTimerStartDuration * 1000) - (restTimerEndTime - Date.now());
            const elapsedSecs = Math.max(0, Math.floor(elapsedMs / 1000));
            if (elapsedSecs > 2) {
                saveRestDuration(elapsedSecs);
            }
        }
        
        // Automatically start rest timer when a set is added (+1)
        startRestTimer();
    } else {
        // Cancel timer if a set is subtracted (-1)
        cancelRestTimer();
        
        // Hide last rest duration and clear stored state when subtracting
        lastRestContainer.style.display = 'none';
        lastSetTimestamp = null;
        localStorage.removeItem('last_set_timestamp');
        localStorage.removeItem('last_rest_formatted');
    }
    
    if (navigator.vibrate) {
        navigator.vibrate(15);
    }
}

// Workout Sets - Update UI
function updateSetsUI(triggerPop = true) {
    setsDisplay.textContent = totalSets;
    
    if (triggerPop) {
        setsContainer.classList.add('pop');
        setTimeout(() => {
            setsContainer.classList.remove('pop');
        }, 200);
    }
    
    localStorage.setItem('workout_sets', totalSets);
}

// Screen Wake Lock API helpers (Standard Native WakeLock Only)
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
            console.log('Screen Wake Lock request failed:', err);
        }
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release()
            .then(() => {
                wakeLock = null;
            })
            .catch(err => {
                console.log('Screen Wake Lock release failed:', err);
                wakeLock = null;
            });
    }
    
    // Suspend AudioContext to release iOS audio thread/session which can prevent auto-lock
    if (audioCtx && audioCtx.state === 'running') {
        audioCtx.suspend().catch(err => console.log('AudioContext suspend failed:', err));
    }
}

// Dynamically request or release screen Wake Lock based on running status
function updateWakeLockState() {
    const isStopwatchRunning = (stopwatchInterval !== null);
    const isRestTimerRunning = (restTimerInterval !== null);
    
    if (isStopwatchRunning || isRestTimerRunning) {
        requestWakeLock();
    } else {
        releaseWakeLock();
    }
}

// Workout Sets - Start Rest Timer
function startRestTimer(isResume = false) {
    // Clear any running timer first
    if (restTimerInterval) {
        clearInterval(restTimerInterval);
    }
    
    if (!isResume) {
        restTimerEndTime = Date.now() + (defaultRestDuration * 1000);
        localStorage.setItem('rest_timer_end_time', restTimerEndTime);
        restTimerStartDuration = defaultRestDuration;
        localStorage.setItem('rest_timer_start_duration', restTimerStartDuration);
    } else {
        const savedStartDur = localStorage.getItem('rest_timer_start_duration');
        restTimerStartDuration = savedStartDur ? parseInt(savedStartDur, 10) : defaultRestDuration;
    }
    
    const remainingMs = restTimerEndTime - Date.now();
    restTimeRemaining = Math.max(0, Math.ceil(remainingMs / 1000));
    
    restTimerContainer.classList.add('active');
    restTimerDisplay.classList.remove('finished');
    updateTimerText();
    
    restTimerInterval = setInterval(() => {
        const currentMs = restTimerEndTime - Date.now();
        restTimeRemaining = Math.max(0, Math.ceil(currentMs / 1000));
        
        // Keep AudioContext active on iOS Safari by playing a silent vibration note every 15 seconds
        if (restTimeRemaining > 0 && restTimeRemaining % 15 === 0) {
            keepAudioContextAlive();
        }
        
        if (currentMs <= 0) {
            // Timer Finished
            clearInterval(restTimerInterval);
            restTimerInterval = null;
            restTimerEndTime = null;
            localStorage.removeItem('rest_timer_end_time');
            localStorage.removeItem('rest_timer_start_duration');
            
            // Save the completed rest duration
            saveRestDuration(restTimerStartDuration);
            
            // Trigger haptics notification
            if (navigator.vibrate) {
                navigator.vibrate([100, 100, 100, 100, 300]);
            }
            
            // Play physical beep sound using Web Audio API (zero dependencies)
            playTimerBeep();
            
            // Delay releasing wake lock & suspending AudioContext by 1.5 seconds to let the alarm beep play out
            setTimeout(() => {
                updateWakeLockState();
            }, 1500);
            
            // Visual alert
            restTimerTextDisplay.textContent = '준비 완료!';
            restTimerDisplay.classList.add('finished');
            
            // Auto-reset to idle after 10 seconds
            setTimeout(() => {
                if (restTimerDisplay.classList.contains('finished')) {
                    cancelRestTimer();
                }
            }, 10000);
        } else {
            updateTimerText();
        }
    }, 1000);
    
    updateWakeLockState();
}

// Format and update timer countdown text
function updateTimerText() {
    const mins = Math.floor(restTimeRemaining / 60);
    const secs = restTimeRemaining % 60;
    const formattedMins = mins < 10 ? '0' + mins : mins;
    const formattedSecs = secs < 10 ? '0' + secs : secs;
    restTimerTextDisplay.textContent = formattedMins + ':' + formattedSecs;
}

// Cancel / Skip active timer or manually start it
function handleTimerClick() {
    if (restTimerInterval) {
        // Timer was active, calculate elapsed time and save
        const elapsedMs = (restTimerStartDuration * 1000) - (restTimerEndTime - Date.now());
        const elapsedSecs = Math.max(0, Math.floor(elapsedMs / 1000));
        if (elapsedSecs > 2) {
            saveRestDuration(elapsedSecs);
        }
        cancelRestTimer();
    } else if (restTimerDisplay.classList.contains('finished')) {
        // Timer was already finished ("준비 완료!" flashing), return to idle
        cancelRestTimer();
    } else {
        // Timer was idle, start it manually!
        initAudioContext();
        startRestTimer();
    }
}

function cancelRestTimer() {
    if (restTimerInterval) {
        clearInterval(restTimerInterval);
        restTimerInterval = null;
    }
    updateWakeLockState();
    restTimerEndTime = null;
    localStorage.removeItem('rest_timer_end_time');
    localStorage.removeItem('rest_timer_start_duration');
    
    restTimerContainer.classList.remove('active');
    restTimerDisplay.classList.remove('finished');
    restTimeRemaining = defaultRestDuration;
    updateTimerText();
    
    if (navigator.vibrate) {
        navigator.vibrate(30);
    }
}

// Add 30 seconds to the current running rest timer
function add30Seconds(event) {
    if (event) event.stopPropagation(); // Prevent stopping the timer
    
    initAudioContext(); // Unlock audio
    
    if (restTimerInterval) {
        restTimerEndTime += 30000;
        restTimerStartDuration += 30;
        localStorage.setItem('rest_timer_end_time', restTimerEndTime);
        localStorage.setItem('rest_timer_start_duration', restTimerStartDuration);
        
        const remainingMs = restTimerEndTime - Date.now();
        restTimeRemaining = Math.max(0, Math.ceil(remainingMs / 1000));
        
        updateTimerText();
    } else {
        // If timer is not running (e.g. finished/hidden), start a new one for 30s
        restTimerStartDuration = 30;
        restTimerEndTime = Date.now() + 30000;
        localStorage.setItem('rest_timer_end_time', restTimerEndTime);
        localStorage.setItem('rest_timer_start_duration', restTimerStartDuration);
        startRestTimer(true);
    }
    
    if (navigator.vibrate) {
        navigator.vibrate(15);
    }
}

// Set Rest Timer Duration presets
function setTimerDuration(seconds) {
    defaultRestDuration = seconds;
    localStorage.setItem('default_rest_duration', defaultRestDuration);
    
    // Update presets indicator UI
    updateDurationSelectorUI();
    
    // If timer is currently running, adjust countdown immediately
    if (restTimerInterval) {
        restTimerEndTime = Date.now() + (seconds * 1000);
        localStorage.setItem('rest_timer_end_time', restTimerEndTime);
        restTimerStartDuration = seconds;
        localStorage.setItem('rest_timer_start_duration', restTimerStartDuration);
        const remainingMs = restTimerEndTime - Date.now();
        restTimeRemaining = Math.max(0, Math.ceil(remainingMs / 1000));
        updateTimerText();
    } else if (!restTimerDisplay.classList.contains('finished')) {
        // If idle, update the displayed default duration immediately
        restTimeRemaining = seconds;
        updateTimerText();
    }
    
    if (navigator.vibrate) {
        navigator.vibrate(20);
    }
}

function updateDurationSelectorUI() {
    const buttons = document.querySelectorAll('.btn-preset-time');
    buttons.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        if (onclickAttr) {
            const value = parseInt(onclickAttr.match(/\d+/)[0], 10);
            btn.classList.toggle('active', value === defaultRestDuration);
        }
    });
}

// Initialize AudioContext on user interaction to unlock sound (crucial for iOS Safari)
function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Handle user interaction to unlock audio and reinforce Wake Lock (iOS Safari requirement)
function handleUserInteraction() {
    initAudioContext();
    updateWakeLockState();
}

// Add touch/click listeners to unlock audio and wake lock
window.addEventListener('click', handleUserInteraction, { once: false });
window.addEventListener('touchstart', handleUserInteraction, { once: false });

// Keep AudioContext alive on iOS Safari by playing an imperceptible silent vibration note
function keepAudioContextAlive() {
    try {
        initAudioContext();
        if (!audioCtx || audioCtx.state !== 'running') return;
        
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.value = 1; // 1 Hz (infrasonic, completely silent)
        gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime); // Extremely quiet
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
        console.log('Audio keepalive failed:', e);
    }
}

// Play loud electronic beep dynamically via Web Audio API (Fallback)
function playWebAudioBeepFallback() {
    try {
        initAudioContext();
        if (!audioCtx) return;
        
        const now = audioCtx.currentTime;
        
        // Helper to play a single beep segment at a specific start time
        function playBeepSegment(startTime, duration) {
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            osc.type = 'square'; // Square wave for maximum piercing loudness
            osc.frequency.setValueAtTime(1500, startTime); // High pitch (1500Hz)
            
            // Set high volume (0.8) and fade out towards the end to prevent clicking
            gainNode.gain.setValueAtTime(0.8, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
            
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            osc.start(startTime);
            osc.stop(startTime + duration);
        }
        
        // Play triple beep pattern (삐-삐-삐익)
        playBeepSegment(now, 0.08);          // Beep 1: 0.08s
        playBeepSegment(now + 0.12, 0.08);   // Beep 2: 0.08s (after 0.04s silence)
        playBeepSegment(now + 0.24, 0.16);   // Beep 3: 0.16s (after 0.04s silence)
    } catch (e) {
        console.log('Web Audio fallback beep failed:', e);
    }
}

// Play electronic beep using HTML5 Audio (WAV blob) to mix with background music apps on iOS
function playTimerBeep() {
    try {
        // 44100Hz sample rate, 8-bit mono audio for clean high-frequency sound without aliasing
        const sampleRate = 44100;
        
        // Define triple beep pattern:
        // Beep 1: 0.08s (3528 samples)
        // Silence 1: 0.04s (1764 samples)
        // Beep 2: 0.08s (3528 samples)
        // Silence 2: 0.04s (1764 samples)
        // Beep 3: 0.16s (7056 samples)
        // Total duration: 0.40s (17640 samples)
        const duration = 0.40;
        const numSamples = sampleRate * duration;
        const buffer = new Uint8Array(44 + numSamples);
        
        // 1. Write RIFF WAV Header
        buffer[0] = 0x52; buffer[1] = 0x49; buffer[2] = 0x46; buffer[3] = 0x46; // "RIFF"
        const fileSize = 36 + numSamples;
        buffer[4] = fileSize & 0xff;
        buffer[5] = (fileSize >> 8) & 0xff;
        buffer[6] = (fileSize >> 16) & 0xff;
        buffer[7] = (fileSize >> 24) & 0xff;
        buffer[8] = 0x57; buffer[9] = 0x41; buffer[10] = 0x56; buffer[11] = 0x45; // "WAVE"
        buffer[12] = 0x66; buffer[13] = 0x6d; buffer[14] = 0x74; buffer[15] = 0x20; // "fmt "
        buffer[16] = 16; buffer[17] = 0; buffer[18] = 0; buffer[19] = 0; // Chunk size (16)
        buffer[20] = 1; buffer[21] = 0; // PCM format (1)
        buffer[22] = 1; buffer[23] = 0; // Channels (1 = Mono)
        buffer[24] = sampleRate & 0xff;
        buffer[25] = (sampleRate >> 8) & 0xff;
        buffer[26] = (sampleRate >> 16) & 0xff;
        buffer[27] = (sampleRate >> 24) & 0xff; // Sample rate (8000)
        buffer[28] = sampleRate & 0xff;
        buffer[29] = (sampleRate >> 8) & 0xff;
        buffer[30] = (sampleRate >> 16) & 0xff;
        buffer[31] = (sampleRate >> 24) & 0xff; // Byte rate (8000)
        buffer[32] = 1; buffer[33] = 0; // Block align (1)
        buffer[34] = 8; buffer[35] = 0; // Bits per sample (8)
        buffer[36] = 0x64; buffer[37] = 0x61; buffer[38] = 0x74; buffer[39] = 0x61; // "data"
        buffer[40] = numSamples & 0xff;
        buffer[41] = (numSamples >> 8) & 0xff;
        buffer[42] = (numSamples >> 16) & 0xff;
        buffer[43] = (numSamples >> 24) & 0xff; // Data size
        
        // 2. Generate Audio Data (1500Hz Sine Wave in Triple Beep Pattern)
        const frequency = 1500; // Ultra high-pitched tone to pierce background music
        for (let i = 0; i < numSamples; i++) {
            const sampleTime = i / sampleRate;
            let isPlaying = false;
            let currentBeepProgress = 0;
            let currentBeepDuration = 0;
            
            // Beep sections check
            if (sampleTime >= 0 && sampleTime < 0.08) {
                isPlaying = true;
                currentBeepProgress = sampleTime;
                currentBeepDuration = 0.08;
            } else if (sampleTime >= 0.12 && sampleTime < 0.20) {
                isPlaying = true;
                currentBeepProgress = sampleTime - 0.12;
                currentBeepDuration = 0.08;
            } else if (sampleTime >= 0.24 && sampleTime < 0.40) {
                isPlaying = true;
                currentBeepProgress = sampleTime - 0.24;
                currentBeepDuration = 0.16;
            }
            
            if (isPlaying) {
                const t = i / sampleRate;
                const sine = Math.sin(2 * Math.PI * frequency * t);
                let squareValue = sine >= 0 ? 1 : -1; // Square wave for maximum piercing loudness
                
                // Fade out at the end of each sub-beep (0.015s) to prevent clicking noises
                const fadeOutTime = 0.015;
                const timeRemaining = currentBeepDuration - currentBeepProgress;
                const fadeRatio = Math.min(1, timeRemaining / fadeOutTime);
                squareValue = squareValue * fadeRatio;
                
                // Maximize amplitude to 127 for full volume
                const sampleValue = Math.round((squareValue + 1) * 127);
                buffer[44 + i] = sampleValue;
            } else {
                buffer[44 + i] = 128; // 8-bit silent center value
            }
        }
        
        // 3. Play via HTML5 Audio
        const blob = new Blob([buffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        
        audio.volume = 1.0; // MAX Volume!
        audio.play().then(() => {
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 1000);
        }).catch(err => {
            console.log('HTML5 Audio play failed, falling back:', err);
            playWebAudioBeepFallback();
        });
    } catch (e) {
        console.log('WAV generation failed, falling back:', e);
        playWebAudioBeepFallback();
    }
}

// Workout Sets - Reset confirmation
let resetSetsTimeout = null;
let isConfirmingResetSets = false;

function confirmResetSets() {
    if (!isConfirmingResetSets) {
        isConfirmingResetSets = true;
        resetBtnSets.classList.add('confirming');
        resetBtnSets.querySelector('span').textContent = '한번 더!';
        
        resetSetsTimeout = setTimeout(() => {
            cancelResetSetsState();
        }, 3000);
    } else {
        performResetSets();
    }
}

function cancelResetSetsState() {
    isConfirmingResetSets = false;
    resetBtnSets.classList.remove('confirming');
    resetBtnSets.querySelector('span').textContent = '초기화';
    if (resetSetsTimeout) {
        clearTimeout(resetSetsTimeout);
        resetSetsTimeout = null;
    }
}

function performResetSets() {
    totalSets = 0;
    updateSetsUI(true);
    cancelResetSetsState();
    cancelRestTimer();
    
    // Reset stopwatch on sets reset
    workoutStartTime = null;
    localStorage.removeItem('workout_start_time');
    localStorage.removeItem('workout_is_paused');
    localStorage.removeItem('workout_elapsed_ms');
    stopwatchPaused = false;
    stopwatchElapsedMs = 0;
    stopStopwatch();

    // Reset last rest duration
    lastSetTimestamp = null;
    localStorage.removeItem('last_set_timestamp');
    localStorage.removeItem('last_rest_formatted');
    localStorage.removeItem('rest_timer_end_time');
    restTimerEndTime = null;
    lastRestContainer.style.display = 'none';
    
    if (navigator.vibrate) {
        navigator.vibrate([30, 50, 30]);
    }
}

// Workout Stopwatch - Start
function startStopwatch() {
    if (stopwatchInterval) {
        clearInterval(stopwatchInterval);
    }
    
    // Request Wake Lock to keep screen awake during the entire workout session
    updateWakeLockState();
    
    stopwatchContainer.classList.remove('paused');
    stopwatchContainer.classList.add('running');
    updateStopwatchText();
    stopwatchInterval = setInterval(updateStopwatchText, 1000);
}

// Workout Stopwatch - Stop
function stopStopwatch() {
    if (stopwatchInterval) {
        clearInterval(stopwatchInterval);
        stopwatchInterval = null;
    }
    
    // Release Wake Lock when workout session ends
    updateWakeLockState();
    
    stopwatchContainer.classList.remove('running');
    stopwatchContainer.classList.remove('paused');
    stopwatchDisplay.textContent = '운동 시작';
}

// Handle clicking on the stopwatch container (Start / Pause / Resume)
function handleStopwatchClick() {
    if (workoutStartTime === null) {
        // Start it for the first time
        workoutStartTime = Date.now();
        localStorage.setItem('workout_start_time', workoutStartTime);
        stopwatchPaused = false;
        localStorage.setItem('workout_is_paused', 'false');
        startStopwatch();
        if (navigator.vibrate) {
            navigator.vibrate([30, 50, 30]);
        }
    } else {
        // Toggle pause / resume
        if (!stopwatchPaused) {
            // Pause
            stopwatchElapsedMs = Date.now() - workoutStartTime;
            stopwatchPaused = true;
            localStorage.setItem('workout_is_paused', 'true');
            localStorage.setItem('workout_elapsed_ms', stopwatchElapsedMs);
            
            if (stopwatchInterval) {
                clearInterval(stopwatchInterval);
                stopwatchInterval = null;
            }
            updateWakeLockState(); // Update screen lock state to release it when paused
            
            stopwatchContainer.classList.remove('running');
            stopwatchContainer.classList.add('paused');
            
            // Display current paused time
            updateStopwatchDisplayByMs(stopwatchElapsedMs);
            
            if (navigator.vibrate) {
                navigator.vibrate(20);
            }
        } else {
            // Resume
            workoutStartTime = Date.now() - stopwatchElapsedMs;
            stopwatchPaused = false;
            localStorage.setItem('workout_start_time', workoutStartTime);
            localStorage.setItem('workout_is_paused', 'false');
            localStorage.removeItem('workout_elapsed_ms');
            
            startStopwatch();
            
            if (navigator.vibrate) {
                navigator.vibrate(20);
            }
        }
    }
}

// Format milliseconds and update stopwatch display text (HH:MM:SS or MM:SS)
function updateStopwatchDisplayByMs(elapsedMs) {
    const elapsedSecs = Math.max(0, Math.floor(elapsedMs / 1000));
    const hours = Math.floor(elapsedSecs / 3600);
    const mins = Math.floor((elapsedSecs % 3600) / 60);
    const secs = elapsedSecs % 60;
    
    const formattedMins = mins < 10 ? '0' + mins : mins;
    const formattedSecs = secs < 10 ? '0' + secs : secs;
    
    if (hours > 0) {
        const formattedHours = hours < 10 ? '0' + hours : hours;
        stopwatchDisplay.textContent = formattedHours + ':' + formattedMins + ':' + formattedSecs;
    } else {
        stopwatchDisplay.textContent = formattedMins + ':' + formattedSecs;
    }
}

// Workout Stopwatch - Update Text
function updateStopwatchText() {
    if (workoutStartTime === null) {
        stopStopwatch();
        return;
    }
    const elapsedMs = Date.now() - workoutStartTime;
    updateStopwatchDisplayByMs(elapsedMs);
}

// Handle Custom Input Enter key press
customInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        addCustomProtein();
    }
});

// Handle Weight Input changes
weightInput.addEventListener('input', function() {
    updateUI(false);
});

// Run Initialization
init();

// Handle visibility change to re-acquire Wake Lock if app returns to foreground
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        updateWakeLockState();
    }
});


