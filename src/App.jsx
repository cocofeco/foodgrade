import { useState, useEffect } from 'react';
import { ref, onValue, set, update } from "firebase/database";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { database, auth } from './firebaseConfig';
import './App.css';

// --- PROVABLY FAIR ---
const generateServerSeed = () => {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

const hashServerSeed = async (seed) => {
  const msgBuffer = new TextEncoder().encode(seed);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const generateFairResult = async (serverSeed, clientSeed, nonce) => {
  const enc = new TextEncoder();
  const key = await window.crypto.subtle.importKey(
    "raw", enc.encode(serverSeed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await window.crypto.subtle.sign("HMAC", key, enc.encode(`${clientSeed}:${nonce}`));
  const hashArray = Array.from(new Uint8Array(signature));
  const hex = hashArray.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
  const intVal = parseInt(hex, 16);
  return intVal / 0xFFFFFFFF;
};

const RARITY = {
  common: { name: 'Обычная', color: '#b0c3d9' },
  uncommon: { name: 'Необычная', color: '#5e98d9' },
  rare: { name: 'Редкая', color: '#4b69ff' },
  epic: { name: 'Эпическая', color: '#8847ff' },
  legendary: { name: 'Легендарная', color: '#d32ce6' },
  gold: { name: 'Золотая', color: '#ffd700' }
};

const clickSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3');
const fartSound = new Audio('https://www.myinstants.com/media/sounds/fart.mp3'); 

function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  const [activeTab, setActiveTab] = useState('game'); 
  const [balance, setBalance] = useState(200.00);
  const [inventory, setInventory] = useState([]); 
  const [foodDatabase, setFoodDatabase] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [profileData, setProfileData] = useState({
    nickname: '',
    bestWin: 0,
    createdAt: null,
    xp: 0
  });

  const [onlineUsers] = useState(['Admin', 'Player1', 'Player2']);

  // --- СОСТОЯНИЕ КЛИКЕРА ---
  const [isBouncing, setIsBouncing] = useState(false);
  const [floatingCoins, setFloatingCoins] = useState([]);
  const [clickCount, setClickCount] = useState(0); 
  const [isFarting, setIsFarting] = useState(false);

  const [selectedStakeItems, setSelectedStakeItems] = useState([]); 
  const [targetItem, setTargetItem] = useState(null); 
  
  const [isRolling, setIsRolling] = useState(false);
  const [result, setResult] = useState(null);
  const [pointerRotation, setPointerRotation] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [displayedChance, setDisplayedChance] = useState(null);
  
  const [screenFlash, setScreenFlash] = useState(false);
  const [screenShake, setScreenShake] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [filterType, setFilterType] = useState('all');

  const [serverSeed, setServerSeed] = useState('');
  const [clientSeed] = useState('player-seed-123'); 
  const [nonce, setNonce] = useState(0);

  const getLevelInfo = (xp) => {
    const level = Math.floor((-1 + Math.sqrt(1 + 8 * (xp || 0) / 100)) / 2) + 1;
    const xpForCurrentLevel = (level - 1) * level / 2 * 100;
    const xpForNextLevel = level * (level + 1) / 2 * 100;
    
    const xpInCurrentLevel = (xp || 0) - xpForCurrentLevel;
    const xpNeededForNext = xpForNextLevel - xpForCurrentLevel;
    const progress = Math.min(100, (xpInCurrentLevel / xpNeededForNext) * 100);

    return { level, progress, xpInCurrentLevel, xpNeededForNext };
  };

  const levelInfo = getLevelInfo(profileData.xp);

  const getPoopData = (level) => {
    if (level >= 50) return { emoji: '💩', size: 150, name: 'Гигантская какашка', color: '#8B4513' };
    if (level >= 30) return { emoji: '💩', size: 120, name: 'Огромная какашка', color: '#A0522D' };
    if (level >= 20) return { emoji: '💩', size: 100, name: 'Большая какашка', color: '#CD853F' };
    if (level >= 10) return { emoji: '💩', size: 80, name: 'Средняя какашка', color: '#D2691E' };
    if (level >= 5)  return { emoji: '💩', size: 60, name: 'Маленькая какашка', color: '#DAA520' };
    return { emoji: '💩', size: 45, name: 'Крошечная какашка', color: '#FFD700' };
  };

  const poop = getPoopData(levelInfo.level);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setIsLoadingProfile(false);
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    setIsLoadingProfile(true);
    const userRef = ref(database, `users/${user.uid}`);
    
    const unsubscribe = onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setBalance(data.balance || 200);
        setProfileData({
          nickname: data.nickname || user.email.split('@')[0],
          bestWin: data.bestWin || 0,
          createdAt: data.createdAt || new Date().toISOString(),
          xp: data.xp || 0
        });
        
        const loadedInv = (data.inventory || []).map(item => {
           const fullItem = foodDatabase.find(f => f.name === item.name);
           return {
             ...item,
             rarity: fullItem ? fullItem.rarity : RARITY.common
           };
        });
        setInventory(loadedInv);
      } else {
        const createdAt = new Date().toISOString();
        const starterItems = foodDatabase.length > 0 ? [
          foodDatabase.find(i => i.name === 'Хлеб'),
          foodDatabase.find(i => i.name === 'Картофель'),
          foodDatabase.find(i => i.name === 'Курица'),
          foodDatabase.find(i => i.name === 'Мороженое'),
          foodDatabase.find(i => i.name === 'Кофе'),
          foodDatabase.find(i => i.name === 'Яйцо'),
        ].filter(Boolean).map((item, index) => ({ ...item, uid: Date.now() + index })) : [];

        const defaultData = {
          balance: 200,
          nickname: user.email.split('@')[0],
          bestWin: 0,
          createdAt: createdAt,
          xp: 0,
          inventory: starterItems.map(({ rarity, ...rest }) => rest)
        };
        set(userRef, defaultData);
        setBalance(defaultData.balance);
        setInventory(starterItems);
        setProfileData({ nickname: defaultData.nickname, bestWin: 0, createdAt: createdAt, xp: 0 });
      }
      setIsLoadingProfile(false);
    });

    return () => unsubscribe();
  }, [user, foodDatabase.length]);

  useEffect(() => {
    const itemsRef = ref(database, 'items');
    const unsubscribe = onValue(itemsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const itemsArray = Object.keys(data).map(key => ({
          id: key, 
          ...data[key],
          rarity: RARITY[data[key].rarity] || RARITY.common
        }));
        setFoodDatabase(itemsArray);
        if (!targetItem) {
          setTargetItem(itemsArray.find(i => i.name === 'Картофель фри') || itemsArray[0]);
        }
      }
      setIsLoading(false);
    });

    const newSeed = generateServerSeed();
    setServerSeed(newSeed);

    return () => unsubscribe();
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      setAuthError(error.message);
    }
  };

  const handleGoogleAuth = async () => {
    setAuthError('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      setAuthError(error.message);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setInventory([]);
    setBalance(200);
    setActiveTab('game');
  };

  const saveUserData = (updates) => {
    if (user) {
      update(ref(database, `users/${user.uid}`), updates);
    }
  };

  const handleNicknameChange = (e) => {
    const newNick = e.target.value;
    setProfileData(prev => ({ ...prev, nickname: newNick }));
    saveUserData({ nickname: newNick });
  };

  const handleClickerClick = (e) => {
    if (activeTab !== 'clicker') return;

    const newBalance = balance + 1;
    setBalance(newBalance);
    
    const newXp = profileData.xp + 1;
    setProfileData(prev => ({ ...prev, xp: newXp }));
    
    saveUserData({ balance: newBalance, xp: newXp });

    setIsBouncing(true);
    setTimeout(() => setIsBouncing(false), 150);

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newCoin = { id: Date.now(), x, y };
    
    setFloatingCoins(prev => [...prev, newCoin]);
    
    setTimeout(() => {
      setFloatingCoins(prev => prev.filter(c => c.id !== newCoin.id));
    }, 1000);

    clickSound.volume = 0.1;
    clickSound.currentTime = 0;
    clickSound.play().catch(() => {});

    const newClickCount = clickCount + 1;
    
    if (newClickCount >= 100) {
      setClickCount(0); 
      
      fartSound.volume = 0.5;
      fartSound.currentTime = 0;
      fartSound.play().catch(() => {});
      
      setIsFarting(true);
      setTimeout(() => setIsFarting(false), 1000);
    } else {
      setClickCount(newClickCount);
    }
  };

  const totalStakeValue = selectedStakeItems.reduce((sum, item) => sum + item.value, 0);
  const isCompatible = selectedStakeItems.length > 0 && selectedStakeItems.every(
    item => item.type === targetItem?.type || item.type === 'carbs' || item.type === 'bakery'
  );
  
  let baseChance = isCompatible ? (totalStakeValue / targetItem?.value) * 100 : 0;
  let chance = Math.min(baseChance, 90); 
  if (!isCompatible) chance = 0;
  
  const chanceAngle = (chance / 100) * 360;

  const toggleStakeItem = (item) => {
    if (isRolling) return;
    const isSelected = selectedStakeItems.find(i => i.uid === item.uid);
    if (isSelected) {
      setSelectedStakeItems(selectedStakeItems.filter(i => i.uid !== item.uid));
    } else {
      setSelectedStakeItems([...selectedStakeItems, item]);
    }
  };

  const handleAutoSelectTarget = () => {
    if (isRolling || foodDatabase.length === 0) return;
    const possibleTargets = foodDatabase.filter(f => f.value > 20 && f.value < 2000);
    if (possibleTargets.length > 0) {
      const randomTarget = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
      setTargetItem(randomTarget);
      setSelectedStakeItems([]);
      setDisplayedChance(null);
      setResult(null);
    }
  };

  const handleSliderChange = (e) => {
    const percent = Number(e.target.value);
    setSliderValue(percent);
    if (isRolling || !targetItem) return;
    const targetValue = (targetItem.value * percent) / 100;
    const finalTargetValue = Math.min(targetValue, targetItem.value * 0.9);

    let currentSelection = [];
    let currentValue = 0;
    const availableItems = [...inventory]
      .filter(item => item.type === targetItem.type || item.type === 'carbs' || item.type === 'bakery')
      .sort((a, b) => b.value - a.value);

    for (let item of availableItems) {
      if (currentValue >= finalTargetValue) break;
      currentSelection.push(item);
      currentValue += item.value;
    }
    setSelectedStakeItems(currentSelection);
  };

  const handleSellItem = (e, item) => {
    e.stopPropagation();
    if (isRolling) return;
    const newInv = inventory.filter(invItem => invItem.uid !== item.uid);
    const newBal = balance + item.value;
    const newXp = profileData.xp + 5;
    
    setInventory(newInv);
    setBalance(newBal);
    setProfileData(prev => ({ ...prev, xp: newXp }));
    
    saveUserData({ balance: newBal, inventory: newInv.map(({rarity, ...r}) => r), xp: newXp });
    setSelectedStakeItems(prev => prev.filter(i => i.uid !== item.uid));
  };

  const handleBuyItem = (e, food) => {
    e.stopPropagation();
    if (isRolling || balance < food.value) return;
    const newBal = balance - food.value;
    const newInv = [...inventory, { ...food, uid: Date.now() }];
    const newXp = profileData.xp + 3;

    setBalance(newBal);
    setInventory(newInv);
    setProfileData(prev => ({ ...prev, xp: newXp }));

    saveUserData({ balance: newBal, inventory: newInv.map(({rarity, ...r}) => r), xp: newXp });
  };

  const handleUpgrade = async () => {
    if (!targetItem || chance <= 0 || totalStakeValue === 0 || !isCompatible || isRolling) return;
    if (targetItem.value <= totalStakeValue) return alert("Цель должна быть дороже!");

    setIsRolling(true);
    setResult(null);
    setDisplayedChance(null);
    
    const invAfterStake = inventory.filter(invItem => !selectedStakeItems.find(s => s.uid === invItem.uid));
    setInventory(invAfterStake);
    
    const floatResult = await generateFairResult(serverSeed, clientSeed, nonce);
    const isWin = floatResult < (chance / 100);
    setNonce(prev => prev + 1);

    let targetRotation = pointerRotation + 1800; 
    const MARGIN = 10; 

    if (isWin) {
      const safeZone = Math.max(1, chanceAngle - (MARGIN * 2));
      targetRotation += MARGIN + Math.random() * safeZone;
    } else {
      const remaining = 360 - chanceAngle;
      const safeZone = Math.max(1, remaining - (MARGIN * 2));
      targetRotation += chanceAngle + MARGIN + Math.random() * safeZone;
    }

    setPointerRotation(targetRotation);
    setIsAnimating(true);

    setTimeout(() => {
      setIsRolling(false);
      setIsAnimating(false);
      setSelectedStakeItems([]); 
      
      let newInv = [...invAfterStake];
      const newXp = profileData.xp + 20;
      
      if (isWin) {
        newInv.push({ ...targetItem, uid: Date.now() });
        setResult({ type: 'success', message: `ВЫПАЛО: ${targetItem.name}` });
        setDisplayedChance({ value: chance, isWin: true });
        setScreenFlash(true);
        setTimeout(() => setScreenFlash(false), 500);
        
        if (targetItem.value > profileData.bestWin) {
          setProfileData(prev => ({ ...prev, bestWin: targetItem.value, xp: newXp }));
          saveUserData({ bestWin: targetItem.value, xp: newXp });
        } else {
          setProfileData(prev => ({ ...prev, xp: newXp }));
          saveUserData({ xp: newXp });
        }
      } else {
        const isCompensated = Math.random() < 0.5;
        if (isCompensated) {
          const affordableItems = foodDatabase.filter(f => f.value < totalStakeValue);
          if (affordableItems.length > 0) {
            const randomCompItem = affordableItems[Math.floor(Math.random() * affordableItems.length)];
            newInv.push({ ...randomCompItem, uid: Date.now() });
            setResult({ type: 'compensation', message: `КОМПЕНСАЦИЯ: ${randomCompItem.name}` });
          } else {
            setResult({ type: 'fail', message: 'НЕУДАЧА!' });
          }
        } else {
          setResult({ type: 'fail', message: 'НЕУДАЧА!' });
        }
        setDisplayedChance({ value: chance, isWin: false });
        setScreenShake(true);
        setTimeout(() => setScreenShake(false), 400);
        
        setProfileData(prev => ({ ...prev, xp: newXp }));
      }
      
      setInventory(newInv);
      saveUserData({ balance: balance, inventory: newInv.map(({rarity, ...r}) => r) });
    }, 4000); 
  };

  if (!user && !isLoadingProfile) {
    return (
      <div className="auth-container">
        <div className="floating-food-bg">
          <span className="food-float food-1">🍕</span>
          <span className="food-float food-2">🍔</span>
          <span className="food-float food-3">🍣</span>
          <span className="food-float food-4">🍩</span>
          <span className="food-float food-5">🥑</span>
          <span className="food-float food-6">🍓</span>
          <span className="food-float food-7">🥩</span>
          <span className="food-float food-8">🍦</span>
          <span className="food-float food-9">🌮</span>
          <span className="food-float food-10">🍺</span>
        </div>

        <div className="auth-box">
          <div className="logo">⏶ FOODGRADE</div>
          <h2>{isRegistering ? 'Регистрация' : 'Вход'}</h2>
          
          <form onSubmit={handleAuth} className="auth-form">
            <div className="input-group">
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="input-group">
              <input type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            
            {authError && <div className="auth-error">{authError}</div>}
            
            <button type="submit" className="auth-submit-btn">
              {isRegistering ? 'Зарегистрироваться' : 'Войти'}
            </button>
          </form>

          <div className="auth-divider"><span>или</span></div>
          
          <button className="google-btn" onClick={handleGoogleAuth}>
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" />
            Войти через Google
          </button>
          
          <p onClick={() => setIsRegistering(!isRegistering)} className="auth-switch">
            {isRegistering ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
          </p>
        </div>
      </div>
    );
  }

  if (isLoadingProfile || isLoading || !targetItem) {
    return <div className="loading-screen">Загрузка профиля...</div>;
  }

  const filteredFood = foodDatabase.filter(food => filterType === 'all' || food.type === filterType);

  return (
    <div className={`app-layout ${screenShake ? 'shake-effect' : ''}`}>
      {screenFlash && <div className="screen-flash"></div>}

      <header className="top-header">
        <div className="header-left">
          <div className="logo">⏶ FOODGRADE</div>
          <div className="nav-tabs">
            <button className={activeTab === 'game' ? 'active' : ''} onClick={() => setActiveTab('game')}>🎮 Игра</button>
            <button className={activeTab === 'clicker' ? 'active' : ''} onClick={() => setActiveTab('clicker')}>🍑 Кликер</button>
            <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>👤 Профиль</button>
            <button className={activeTab === 'rules' ? 'active' : ''} onClick={() => setActiveTab('rules')}>ℹ️ Правила</button>
          </div>
        </div>
        
        <div className="header-right">
          <div className="online-badge" title="Игроков онлайн">🟢 {onlineUsers.length}</div>
          <div className="balance">Баланс: <span>{balance.toFixed(2)}</span> 🪙</div>
        </div>
      </header>

      {activeTab === 'game' && (
        <main className="main-upgrader-area">
          <div className="top-panel stake-panel">
            <div className="panel-title">Выберите еду для ставки</div>
            <div className="item-display-box">
              {selectedStakeItems.length === 0 ? (
                <span className="empty-text">Выберите еду</span>
              ) : (
                <div className="selected-emojis">
                  {selectedStakeItems.map(item => (
                    <img key={item.uid} src={item.img} alt={item.name} className="stake-img" style={{ filter: `drop-shadow(0 0 15px ${item.rarity.color})` }} />
                  ))}
                </div>
              )}
            </div>
            <div className="slider-area">
              <div className="slider-info">Сумма: <span>{totalStakeValue} 🪙</span></div>
            </div>
          </div>

          <div className="center-panel">
            <div className="wheel-container">
              <div className="wheel-glow" style={{ boxShadow: `0 0 50px ${chance > 0 ? targetItem.rarity.color + '44' : 'transparent'}` }}></div>
              <div className="wheel-ticks"></div>
              <div 
                className="wheel-gradient" 
                style={{ 
                  background: chance === 0 
                    ? '#2a2a35' 
                    : `conic-gradient(
                        from 0deg, 
                        #4caf50 0deg, 
                        #8bc34a ${chanceAngle * 0.6}deg,
                        #ffeb3b ${chanceAngle * 0.9}deg,
                        #ff9800 ${chanceAngle}deg, 
                        #2a2a35 ${chanceAngle}deg, 
                        #2a2a35 360deg
                      )` 
                }}
              ></div>
              <div className="wheel-inner">
                {displayedChance && !isRolling ? (
                  <>
                    <span className={`wheel-result-text ${displayedChance.isWin ? 'win' : 'lose'}`}>{displayedChance.isWin ? 'ПОБЕДА' : 'ПРОИГРЫШ'}</span>
                    <span className="wheel-chance" style={{ color: displayedChance.isWin ? '#4caf50' : '#f44336', textShadow: `0 0 15px ${displayedChance.isWin ? '#4caf50' : '#f44336'}` }}>{displayedChance.value.toFixed(2)}%</span>
                  </>
                ) : (
                  <>
                    <span className={`wheel-chance ${isRolling ? 'pulse' : ''}`} style={{ color: chance > 0 ? '#fff' : '#f44336' }}>{chance.toFixed(2)}%</span>
                    <span className="wheel-label">{isRolling ? 'КРУТИМ...' : chance === 0 ? 'Нет шанса' : 'Шанс успеха'}</span>
                  </>
                )}
              </div>
              <div className="wheel-arrow" style={{ transform: `rotate(${pointerRotation}deg)`, transition: isAnimating ? 'transform 3.8s cubic-bezier(0.1, 0.8, 0.1, 1)' : 'none' }}>
                <div className="arrow-inner"></div>
              </div>
            </div>

            <button className="upgrade-btn" onClick={handleUpgrade} disabled={isRolling || !isCompatible || totalStakeValue === 0 || chance === 0}>
              {isRolling ? 'КРУТИМ...' : '⏶ Улучшить'}
            </button>
            
            <div className="stake-slider-container">
              <div className="stake-slider-labels">
                <span>0%</span>
                <span style={{color: '#ffd700', fontWeight: '900'}}>{Math.floor(baseChance)}%</span>
                <span>90%</span>
              </div>
              <input type="range" min="0" max="90" step="1" value={sliderValue} onChange={handleSliderChange} disabled={isRolling} className="stake-range-input" />
            </div>

            {result && !isRolling && (
              <div className={`result-popup ${result.type}`} style={{ borderColor: result.type === 'success' ? '#4caf50' : result.type === 'compensation' ? '#ff9800' : '#f44336' }}>
                {result.type === 'success' && (
                  <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'}}>
                    <img src={targetItem.img} alt="win" style={{width: '40px', height: '40px', filter: `drop-shadow(0 0 10px ${targetItem.rarity.color})`}} />
                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start'}}>
                      <span style={{fontSize: '10px', color: targetItem.rarity.color, textTransform: 'uppercase'}}>{targetItem.rarity.name}</span>
                      <span>{targetItem.name}</span>
                    </div>
                  </div>
                )}
                {result.type === 'compensation' && result.message}
                {result.type === 'fail' && 'Ставка сгорела'}
              </div>
            )}
          </div>

          <div className="top-panel target-panel">
            <div className="panel-title">Выберите цель</div>
            <div className="target-content-wrapper">
              <div className={`target-container ${result?.type === 'success' && !isRolling ? 'win-effect' : ''}`}>
                <img src={targetItem.img} alt={targetItem.name} className={`target-img ${result?.type === 'success' && !isRolling ? 'win-bounce' : ''}`} style={{ filter: `drop-shadow(0 0 25px ${targetItem.rarity.color})` }} />
                <div className="target-info">
                  <span className="target-name" style={{ color: targetItem.rarity.color }}>{targetItem.name}</span>
                  <span className="target-price">{targetItem.value} 🪙</span>
                </div>
              </div>
            </div>
            <button className="auto-btn-inline" onClick={handleAutoSelectTarget} title="Случайная цель">🎲 Случайная цель</button>
          </div>

          <section className="bottom-grids-area" style={{gridColumn: '1 / -1'}}>
            <div className="grid-container">
              <div className="grid-header">
                <h3>🎒 Мой инвентарь</h3>
                <span style={{fontSize: '10px', color: '#888'}}>Кнопка $ — продать</span>
              </div>
              <div className="cards-grid">
                {inventory.map((item) => {
                  const isSelected = selectedStakeItems.find(i => i.uid === item.uid);
                  const isCompatibleWithTarget = item.type === targetItem.type || item.type === 'carbs' || item.type === 'bakery';
                  return (
                    <div key={item.uid} className={`item-card ${isSelected ? 'selected' : ''} ${!isCompatibleWithTarget ? 'incompatible' : ''}`} onClick={() => toggleStakeItem(item)} style={{ borderColor: isSelected ? '#ffd700' : item.rarity.color + '33' }}>
                      <div className="item-bg-glow" style={{ background: `radial-gradient(circle, ${item.rarity.color}22 0%, transparent 70%)` }}></div>
                      <img src={item.img} alt={item.name} className="item-emoji" />
                      <button className="sell-btn" onClick={(e) => handleSellItem(e, item)} title={`Продать за ${item.value}`}>$</button>
                      <div className="item-details">
                        <span className="item-name" style={{ color: item.rarity.color }}>{item.name}</span>
                        <span className="item-price">{item.value} 🪙</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="grid-container">
              <div className="grid-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
                <h3>🎯 Витрина</h3>
                <div className="filter-buttons">
                  <button className={filterType === 'all' ? 'active' : ''} onClick={() => setFilterType('all')}>Все</button>
                  <button className={filterType === 'bakery' ? 'active' : ''} onClick={() => setFilterType('bakery')}>Выпечка</button>
                  <button className={filterType === 'veg' ? 'active' : ''} onClick={() => setFilterType('veg')}>Овощи</button>
                  <button className={filterType === 'meat' ? 'active' : ''} onClick={() => setFilterType('meat')}>Мясо</button>
                  <button className={filterType === 'sweet' ? 'active' : ''} onClick={() => setFilterType('sweet')}>Сладкое</button>
                  <button className={filterType === 'drink' ? 'active' : ''} onClick={() => setFilterType('drink')}>Напитки</button>
                  <button className={filterType === 'fastfood' ? 'active' : ''} onClick={() => setFilterType('fastfood')}>Фастфуд</button>
                  <button className={filterType === 'carbs' ? 'active' : ''} onClick={() => setFilterType('carbs')}>База</button>
                  <button className={filterType === 'soup' ? 'active' : ''} onClick={() => setFilterType('soup')}>Супы</button>
                  <button className={filterType === 'sauce' ? 'active' : ''} onClick={() => setFilterType('sauce')}>Соусы</button>
                </div>
              </div>
              <div className="cards-grid">
                {filteredFood.map((food) => (
                  <div key={food.id} className={`item-card ${targetItem.id === food.id ? 'target-active' : ''}`} onClick={() => { if (!isRolling) { setTargetItem(food); setDisplayedChance(null); setResult(null); } }} style={{ borderColor: targetItem.id === food.id ? '#ffd700' : food.rarity.color + '33' }}>
                    <div className="item-bg-glow" style={{ background: `radial-gradient(circle, ${food.rarity.color}22 0%, transparent 70%)` }}></div>
                    <img src={food.img} alt={food.name} className="item-emoji" />
                    <button className="buy-btn" onClick={(e) => handleBuyItem(e, food)} title={`Купить за ${food.value}`}>🛒</button>
                    <div className="item-details">
                      <span className="item-name" style={{ color: food.rarity.color }}>{food.name}</span>
                      <span className="item-price">{food.value} 🪙</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      )}

      {activeTab === 'clicker' && (
        <div className="clicker-container">
           <div className="clicker-wrapper">
              <h2>Кликер по попе</h2>
              <p>Кликай и получай монеты!</p>
              
              <div 
                className={`clicker-target ${isBouncing ? 'bounce' : ''}`} 
                onClick={handleClickerClick}
              >
                <img src="/butt.png" alt="Попа" className="big-butt-emoji" onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                <span className="big-butt-emoji-fallback" style={{ display: 'none' }}>🍑</span>
                
                {floatingCoins.map(coin => (
                  <span 
                    key={coin.id} 
                    className="floating-coin"
                    style={{ left: coin.x, top: coin.y }}
                  >
                    +1 🪙
                  </span>
                ))}

                {isFarting && (
                  <div className="fart-effect">
                    <div className="fart-cloud"></div>
                    <div className="fart-cloud-2"></div>
                  </div>
                )}
              </div>

              <p style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
                Кликов: {clickCount} / 100
              </p>
           </div>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="profile-container">
          <div className="profile-card">
            
            <div className="profile-left">
              <input 
                className="nickname-input" 
                value={profileData.nickname} 
                onChange={handleNicknameChange} 
                placeholder="Ваш никнейм"
                maxLength={15}
              />
              <p className="profile-email">{user.email}</p>
              
              <div className="xp-container">
                 <div className="xp-header">
                    <span>Уровень {levelInfo.level}</span>
                    <span>{levelInfo.xpInCurrentLevel} / {levelInfo.xpNeededForNext} XP</span>
                 </div>
                 <div className="xp-bar-bg">
                    <div className="xp-bar-fill" style={{ width: `${levelInfo.progress}%` }}></div>
                 </div>
              </div>

              <div className="profile-stats">
                 <div className="stat-item">
                   <span>Дата регистрации:</span>
                   <strong>{profileData.createdAt ? new Date(profileData.createdAt).toLocaleDateString() : '—'}</strong>
                 </div>
                 <div className="stat-item">
                   <span>Лучший выигрыш:</span>
                   <strong>{profileData.bestWin} 🪙</strong>
                 </div>
                 <div className="stat-item">
                   <span>Баланс:</span>
                   <strong>{balance.toFixed(2)} 🪙</strong>
                 </div>
                 <div className="stat-item">
                   <span>Всего предметов:</span>
                   <strong>{inventory.length}</strong>
                 </div>
              </div>

              <button className="logout-btn" onClick={handleLogout}>
                Выйти из аккаунта
              </button>
            </div>

            <div className="profile-right">
              <div 
                className="poop-avatar" 
                style={{ 
                  fontSize: `${poop.size * 1.5}px`,
                  filter: `drop-shadow(0 0 30px ${poop.color})` 
                }}
              >
                {poop.emoji}
              </div>
              <p className="poop-title" style={{ color: poop.color }}>{poop.name}</p>
            </div>
            
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="rules-container">
          <div className="rules-card">
            <h2>📖 Правила игры</h2>
            <div className="rules-content">
              <h3>🎯 Как играть?</h3>
              <p>Выбирайте еду из инвентаря для ставки и цель из витрины. Чем выше стоимость цели и больше ставка, тем выше шанс успеха.</p>
              
              <h3>📈 Шанс успеха</h3>
              <p>Максимальный шанс — 90%. Он рассчитывается как отношение суммы вашей ставки к стоимости цели. Если продукты несовместимы (например, мясо и овощи), шанс будет 0%.</p>
              
              <h3>🍀 Компенсация</h3>
              <p>При проигрыше с шансом 50% вы получите случайный продукт, стоимость которого ниже вашей ставки.</p>

              <h3>💎 Честность (Provably Fair)</h3>
              <p>Результаты генерируются на основе криптографического хеша (HMAC-SHA256). Это гарантирует, что результат не подкручивается. Текущий хеш сервера можно посмотреть в консоли браузера.</p>
              
              <h3>📈 Уровни</h3>
              <p>Игрок получает опыт (XP) за клики (+1), покупки (+3), продажи (+5) и апгрейды (+20). При накоплении определенного количества XP уровень повышается, открывая доступ к новым возможностям в будущем.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;