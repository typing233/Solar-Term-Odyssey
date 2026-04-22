class SolarTermGame {
    constructor() {
        this.gameState = {
            currentScreen: 'start',
            difficulty: 'easy',
            currentLevel: 1,
            score: 0,
            correctAnswers: 0,
            totalQuestions: 0,
            gameData: null,
            currentQuestionIndex: 0,
            currentPoemIndex: 0,
            selectedLeftItem: null,
            selectedRightItem: null,
            matchedPairs: [],
            medals: [],
            currentPoemBlanks: [],
            filledBlanks: [],
            currentStreak: 0,
            maxStreak: 0,
            startTime: null,
            userId: null,
            timelineState: {
                placedTerms: {},
                correctOrder: [],
                shuffledTerms: [],
                perfectTimeline: false
            }
        };
        
        this.init();
    }

    async init() {
        await this.initUser();
        this.loadGameProgress();
        this.bindEvents();
        this.updateMedalsDisplay();
        this.loadAchievements();
        this.checkGameReady();
    }

    async initUser() {
        let userId = localStorage.getItem('solarTermUserId');
        
        if (!userId) {
            try {
                const response = await fetch('/api/progress', {
                    method: 'GET'
                });
                const data = await response.json();
                if (data.success && data.userId) {
                    userId = data.userId;
                    localStorage.setItem('solarTermUserId', userId);
                }
            } catch (error) {
                console.error('创建用户失败:', error);
            }
        }
        
        this.gameState.userId = userId;
    }

    checkGameReady() {
        if (typeof app !== 'undefined' && app.pyReady) {
            console.log('Python后端已就绪');
        }
    }

    loadGameProgress() {
        const savedProgress = localStorage.getItem('solarTermProgress');
        if (savedProgress) {
            const progress = JSON.parse(savedProgress);
            this.gameState.medals = progress.medals || [];
            this.gameState.score = progress.totalScore || 0;
        }
    }

    saveGameProgress() {
        const progress = {
            medals: this.gameState.medals,
            totalScore: this.gameState.score,
            lastPlayed: new Date().toISOString()
        };
        localStorage.setItem('solarTermProgress', JSON.stringify(progress));
    }

    async loadAchievements() {
        try {
            const response = await fetch('/api/achievements');
            this.allAchievements = await response.json();
        } catch (error) {
            console.error('加载成就列表失败:', error);
            this.allAchievements = [];
        }
    }

    bindEvents() {
        document.getElementById('start-btn').addEventListener('click', () => this.showScreen('difficulty'));
        document.getElementById('back-to-start').addEventListener('click', () => this.showScreen('start'));
        document.getElementById('exit-game').addEventListener('click', () => this.confirmExit());
        document.getElementById('quiz-next').addEventListener('click', () => this.nextQuizQuestion());
        document.getElementById('matching-next').addEventListener('click', () => this.nextLevel());
        document.getElementById('poetry-next').addEventListener('click', () => this.nextPoem());
        document.getElementById('timeline-next').addEventListener('click', () => this.checkTimelineAndProceed());
        document.getElementById('play-again').addEventListener('click', () => this.restartGame());
        document.getElementById('back-to-menu').addEventListener('click', () => this.showScreen('difficulty'));
        
        document.querySelectorAll('.difficulty-card').forEach(card => {
            card.addEventListener('click', () => this.selectDifficulty(card.dataset.difficulty));
        });
        
        document.getElementById('modal-close').addEventListener('click', () => this.hideModal());
        document.getElementById('modal-confirm').addEventListener('click', () => this.hideModal());

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        document.querySelectorAll('.diff-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchLeaderboardDiff(btn.dataset.diff));
        });

        document.getElementById('term-detail-close').addEventListener('click', () => {
            document.getElementById('term-detail-modal').classList.add('hidden');
        });

        document.getElementById('term-detail-modal').addEventListener('click', (e) => {
            if (e.target.id === 'term-detail-modal') {
                document.getElementById('term-detail-modal').classList.add('hidden');
            }
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });

        const targetContent = document.getElementById(`tab-${tabName}`);
        if (targetContent) {
            targetContent.classList.remove('hidden');
        }

        if (tabName === 'achievements') {
            this.renderAchievements();
        } else if (tabName === 'stats') {
            this.renderStats();
        } else if (tabName === 'leaderboard') {
            this.renderLeaderboard('easy');
        }
    }

    switchLeaderboardDiff(diff) {
        document.querySelectorAll('.diff-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.diff === diff);
        });
        this.renderLeaderboard(diff);
    }

    async renderLeaderboard(difficulty) {
        const container = document.getElementById('leaderboard-display');
        if (!container) return;

        try {
            const url = `/api/leaderboard?difficulty=${difficulty}&limit=10${this.gameState.userId ? `&userId=${encodeURIComponent(this.gameState.userId)}` : ''}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.success) {
                let html = `
                    <div class="leaderboard-header">
                        <span>排名</span>
                        <span>玩家</span>
                        <span>分数</span>
                    </div>
                `;

                if (data.leaderboard && data.leaderboard.length > 0) {
                    data.leaderboard.forEach((entry, index) => {
                        const isCurrentUser = this.gameState.userId && entry.user_id === this.gameState.userId;
                        const rankClass = entry.rank <= 3 ? `rank-${entry.rank}` : '';
                        const rankIcon = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank;
                        
                        html += `
                            <div class="leaderboard-row ${isCurrentUser ? 'current-user-rank' : ''}">
                                <span class="leaderboard-rank ${rankClass}">${rankIcon}</span>
                                <span class="leaderboard-name">${entry.user_name || '匿名探索者'}</span>
                                <span class="leaderboard-score">${entry.score}</span>
                            </div>
                        `;
                    });
                } else {
                    html += `
                        <div class="leaderboard-empty">
                            暂无排行榜数据，快来挑战吧！
                        </div>
                    `;
                }

                if (data.userRank) {
                    html += `
                        <div class="leaderboard-row current-user-rank">
                            <span class="leaderboard-rank">我的</span>
                            <span class="leaderboard-name">当前排名</span>
                            <span class="leaderboard-score">第${data.userRank.rank}名 · ${data.userRank.score}分</span>
                        </div>
                    `;
                }

                container.innerHTML = html;
            }
        } catch (error) {
            console.error('加载排行榜失败:', error);
            container.innerHTML = `<div class="leaderboard-empty">加载排行榜失败</div>`;
        }
    }

    async renderVictoryLeaderboard() {
        const container = document.getElementById('victory-leaderboard-display');
        if (!container) return;

        try {
            const url = `/api/leaderboard?difficulty=${this.gameState.difficulty}&limit=5${this.gameState.userId ? `&userId=${encodeURIComponent(this.gameState.userId)}` : ''}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.success) {
                let html = `
                    <div class="leaderboard-header">
                        <span>排名</span>
                        <span>玩家</span>
                        <span>分数</span>
                    </div>
                `;

                if (data.leaderboard && data.leaderboard.length > 0) {
                    data.leaderboard.forEach((entry) => {
                        const isCurrentUser = this.gameState.userId && entry.user_id === this.gameState.userId;
                        const rankClass = entry.rank <= 3 ? `rank-${entry.rank}` : '';
                        const rankIcon = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank;
                        
                        html += `
                            <div class="leaderboard-row ${isCurrentUser ? 'current-user-rank' : ''}">
                                <span class="leaderboard-rank ${rankClass}">${rankIcon}</span>
                                <span class="leaderboard-name">${entry.user_name || '匿名探索者'}</span>
                                <span class="leaderboard-score">${entry.score}</span>
                            </div>
                        `;
                    });
                } else {
                    html += `
                        <div class="leaderboard-empty">
                            暂无排行榜数据，快来挑战吧！
                        </div>
                    `;
                }

                if (data.userRank) {
                    html += `
                        <div class="leaderboard-row current-user-rank">
                            <span class="leaderboard-rank">我的</span>
                            <span class="leaderboard-name">当前排名</span>
                            <span class="leaderboard-score">第${data.userRank.rank}名 · ${data.userRank.score}分</span>
                        </div>
                    `;
                }

                container.innerHTML = html;
            }
        } catch (error) {
            console.error('加载排行榜失败:', error);
            container.innerHTML = `<div class="leaderboard-empty">加载排行榜失败</div>`;
        }
    }

    async renderAchievements() {
        const container = document.getElementById('achievements-display');
        if (!container) return;

        let userProgress = null;
        if (this.gameState.userId) {
            try {
                const response = await fetch(`/api/progress?userId=${encodeURIComponent(this.gameState.userId)}`);
                const data = await response.json();
                if (data.success) {
                    userProgress = data.data;
                }
            } catch (error) {
                console.error('获取用户进度失败:', error);
            }
        }

        const unlockedAchievements = [];
        if (userProgress && userProgress.difficulties) {
            Object.values(userProgress.difficulties).forEach(diff => {
                if (diff.achievements) {
                    unlockedAchievements.push(...diff.achievements);
                }
            });
        }

        if (this.allAchievements && this.allAchievements.length > 0) {
            let html = '';
            this.allAchievements.forEach(ach => {
                const isUnlocked = unlockedAchievements.includes(ach.id);
                html += `
                    <div class="achievement-item ${isUnlocked ? 'unlocked' : 'locked'}">
                        <span class="achievement-icon">${ach.icon}</span>
                        <span class="achievement-name">${ach.name}</span>
                        <span class="achievement-desc">${ach.description}</span>
                    </div>
                `;
            });
            container.innerHTML = html;
        } else {
            container.innerHTML = '<div class="leaderboard-empty">暂无可显示的成就</div>';
        }
    }

    async renderStats() {
        const container = document.getElementById('stats-display');
        if (!container) return;

        let userProgress = null;
        if (this.gameState.userId) {
            try {
                const response = await fetch(`/api/progress?userId=${encodeURIComponent(this.gameState.userId)}`);
                const data = await response.json();
                if (data.success) {
                    userProgress = data.data;
                }
            } catch (error) {
                console.error('获取用户进度失败:', error);
            }
        }

        let html = '';
        
        if (userProgress && userProgress.summary) {
            const summary = userProgress.summary;
            html += `
                <div class="stat-card">
                    <div class="stat-value">${summary.total_score}</div>
                    <div class="stat-label">总文化灵识</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${summary.total_wins}</div>
                    <div class="stat-label">通关次数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${summary.max_streak}</div>
                    <div class="stat-label">最高连击</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${summary.medals_count}/3</div>
                    <div class="stat-label">已获勋章</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${summary.achievements_count}</div>
                    <div class="stat-label">已解锁成就</div>
                </div>
            `;
        } else {
            html += `
                <div class="stat-card">
                    <div class="stat-value">${this.gameState.score}</div>
                    <div class="stat-label">总文化灵识</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${this.gameState.medals.length}</div>
                    <div class="stat-label">已获勋章</div>
                </div>
            `;
        }

        if (userProgress && userProgress.difficulties) {
            html += `
                <div class="difficulty-stats">
                    <h4>📊 各难度详情</h4>
                    <div class="diff-stats-grid">
            `;

            const diffNames = {
                'easy': '简单',
                'medium': '难度升级',
                'hard': '超级难'
            };

            ['easy', 'medium', 'hard'].forEach(diff => {
                const data = userProgress.difficulties[diff] || {};
                html += `
                    <div class="diff-stat-item">
                        <div class="diff-name">${diffNames[diff]}</div>
                        <div class="diff-detail">
                            总分: ${data.total_score || 0}<br>
                            通关: ${data.total_wins || 0}次<br>
                            最高连击: ${data.max_streak || 0}
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        const targetScreen = document.getElementById(`${screenName}-screen`);
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.gameState.currentScreen = screenName;
        }
        
        if (screenName === 'difficulty') {
            this.loadGameProgress();
            this.updateMedalsDisplay();
        }
    }

    async selectDifficulty(difficulty) {
        this.gameState.difficulty = difficulty;
        this.gameState.currentLevel = 1;
        this.gameState.correctAnswers = 0;
        this.gameState.totalQuestions = 0;
        this.gameState.currentQuestionIndex = 0;
        this.gameState.currentPoemIndex = 0;
        this.gameState.currentStreak = 0;
        this.gameState.maxStreak = 0;
        this.gameState.startTime = Date.now();
        
        const difficultyNames = {
            'easy': '简单',
            'medium': '难度升级',
            'hard': '超级难'
        };
        
        document.getElementById('current-difficulty').textContent = difficultyNames[difficulty];
        
        await this.loadLevelData();
        this.showScreen('game');
    }

    async loadLevelData() {
        try {
            const response = await fetch(`/api/game-data?difficulty=${this.gameState.difficulty}&level=${this.gameState.currentLevel}`);
            this.gameState.gameData = await response.json();
            
            this.updateLevelDisplay();
            this.loadGameModule();
        } catch (error) {
            console.error('加载关卡数据失败:', error);
            this.showModal('错误', '加载游戏数据失败，请刷新页面重试。');
        }
    }

    updateLevelDisplay() {
        document.getElementById('current-level').textContent = this.gameState.currentLevel;
        document.getElementById('culture-score').textContent = this.gameState.score;
        
        const content = this.gameState.gameData.content;
        document.getElementById('game-title').textContent = content.title;
        document.getElementById('game-description').textContent = content.description;
    }

    loadGameModule() {
        const content = this.gameState.gameData.content;
        const gameType = content.gameType;
        
        document.getElementById('quiz-module').classList.add('hidden');
        document.getElementById('matching-module').classList.add('hidden');
        document.getElementById('poetry-module').classList.add('hidden');
        document.getElementById('timeline-module').classList.add('hidden');
        
        document.getElementById('quiz-next').classList.add('hidden');
        document.getElementById('matching-next').classList.add('hidden');
        document.getElementById('poetry-next').classList.add('hidden');
        document.getElementById('timeline-next').classList.add('hidden');
        
        switch (gameType) {
            case 'quiz':
                this.loadQuizModule(content);
                break;
            case 'matching':
                this.loadMatchingModule(content);
                break;
            case 'poetry':
                this.loadPoetryModule(content);
                break;
            case 'timeline':
                this.loadTimelineModule(content);
                break;
        }
    }

    loadQuizModule(content) {
        document.getElementById('quiz-module').classList.remove('hidden');
        
        const questions = content.questions;
        this.gameState.totalQuestions += questions.length;
        
        document.getElementById('quiz-total').textContent = questions.length;
        
        this.showQuizQuestion(this.gameState.currentQuestionIndex);
    }

    showQuizQuestion(index) {
        const content = this.gameState.gameData.content;
        const questions = content.questions;
        
        if (index >= questions.length) {
            this.nextLevel();
            return;
        }
        
        document.getElementById('quiz-current').textContent = index + 1;
        
        const question = questions[index];
        document.getElementById('quiz-question').textContent = question.question;
        
        const optionsContainer = document.getElementById('quiz-options');
        optionsContainer.innerHTML = '';
        
        question.options.forEach((option, optIndex) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = option;
            btn.addEventListener('click', () => this.selectQuizOption(optIndex, question.correctAnswer, question.explanation));
            optionsContainer.appendChild(btn);
        });
        
        document.getElementById('quiz-feedback').innerHTML = '';
        document.getElementById('quiz-next').classList.add('hidden');
    }

    selectQuizOption(selectedIndex, correctIndex, explanation) {
        const options = document.querySelectorAll('#quiz-options .option-btn');
        
        options.forEach(btn => btn.disabled = true);
        
        if (selectedIndex === correctIndex) {
            options[selectedIndex].classList.add('correct');
            this.gameState.correctAnswers++;
            this.gameState.score += 10;
            this.gameState.currentStreak++;
            if (this.gameState.currentStreak > this.gameState.maxStreak) {
                this.gameState.maxStreak = this.gameState.currentStreak;
            }
            document.getElementById('culture-score').textContent = this.gameState.score;
            
            document.getElementById('quiz-feedback').innerHTML = `
                <div class="feedback correct">
                    <h4>✅ 回答正确！${this.gameState.currentStreak > 1 ? ` (${this.gameState.currentStreak}连击!)` : ''}</h4>
                    <p>${explanation}</p>
                </div>
            `;
        } else {
            options[selectedIndex].classList.add('incorrect');
            options[correctIndex].classList.add('correct');
            this.gameState.currentStreak = 0;
            
            document.getElementById('quiz-feedback').innerHTML = `
                <div class="feedback incorrect">
                    <h4>❌ 回答错误</h4>
                    <p>${explanation}</p>
                </div>
            `;
        }
        
        document.getElementById('quiz-next').classList.remove('hidden');
    }

    nextQuizQuestion() {
        this.gameState.currentQuestionIndex++;
        this.showQuizQuestion(this.gameState.currentQuestionIndex);
    }

    loadMatchingModule(content) {
        document.getElementById('matching-module').classList.remove('hidden');
        
        const pairs = content.pairs;
        this.gameState.totalQuestions += pairs.length;
        this.gameState.matchedPairs = [];
        this.gameState.selectedLeftItem = null;
        this.gameState.selectedRightItem = null;
        
        document.getElementById('match-total').textContent = pairs.length;
        document.getElementById('match-count').textContent = '0';
        
        const shuffledLeft = this.shuffleArray([...pairs]);
        const shuffledRight = this.shuffleArray([...pairs]);
        
        const leftContainer = document.getElementById('left-items');
        const rightContainer = document.getElementById('right-items');
        
        leftContainer.innerHTML = '<h4>节气</h4>';
        rightContainer.innerHTML = '<h4>民俗活动</h4>';
        
        shuffledLeft.forEach((pair, index) => {
            const item = document.createElement('div');
            item.className = 'matching-item';
            item.textContent = pair.left;
            item.dataset.value = pair.left;
            item.dataset.index = index;
            item.addEventListener('click', () => this.selectMatchingItem('left', item, pair));
            leftContainer.appendChild(item);
        });
        
        shuffledRight.forEach((pair, index) => {
            const item = document.createElement('div');
            item.className = 'matching-item';
            item.textContent = pair.right;
            item.dataset.value = pair.right;
            item.dataset.index = index;
            item.addEventListener('click', () => this.selectMatchingItem('right', item, pair));
            rightContainer.appendChild(item);
        });
        
        document.getElementById('matching-feedback').innerHTML = '';
    }

    selectMatchingItem(side, element, pair) {
        if (element.classList.contains('matched')) return;
        
        const container = side === 'left' ? 
            document.getElementById('left-items') : 
            document.getElementById('right-items');
        
        container.querySelectorAll('.matching-item').forEach(item => {
            if (!item.classList.contains('matched')) {
                item.classList.remove('selected');
            }
        });
        
        element.classList.add('selected');
        
        if (side === 'left') {
            this.gameState.selectedLeftItem = { element, pair };
        } else {
            this.gameState.selectedRightItem = { element, pair };
        }
        
        if (this.gameState.selectedLeftItem && this.gameState.selectedRightItem) {
            this.checkMatching();
        }
    }

    checkMatching() {
        const left = this.gameState.selectedLeftItem;
        const right = this.gameState.selectedRightItem;
        
        if (left.pair.left === right.pair.left && left.pair.right === right.pair.right) {
            left.element.classList.remove('selected');
            left.element.classList.add('matched');
            right.element.classList.remove('selected');
            right.element.classList.add('matched');
            
            this.gameState.correctAnswers++;
            this.gameState.score += 15;
            this.gameState.currentStreak++;
            if (this.gameState.currentStreak > this.gameState.maxStreak) {
                this.gameState.maxStreak = this.gameState.currentStreak;
            }
            document.getElementById('culture-score').textContent = this.gameState.score;
            
            this.gameState.matchedPairs.push(left.pair);
            document.getElementById('match-count').textContent = this.gameState.matchedPairs.length;
            
            document.getElementById('matching-feedback').innerHTML = `
                <div class="feedback correct">
                    <h4>✅ 匹配成功！${this.gameState.currentStreak > 1 ? ` (${this.gameState.currentStreak}连击!)` : ''}</h4>
                    <p>「${left.pair.left}」与「${left.pair.right}」正确匹配！</p>
                </div>
            `;
            
            const totalPairs = this.gameState.gameData.content.pairs.length;
            if (this.gameState.matchedPairs.length >= totalPairs) {
                setTimeout(() => {
                    document.getElementById('matching-next').classList.remove('hidden');
                }, 1000);
            }
        } else {
            left.element.classList.add('wrong-match');
            right.element.classList.add('wrong-match');
            this.gameState.currentStreak = 0;
            
            setTimeout(() => {
                left.element.classList.remove('selected', 'wrong-match');
                right.element.classList.remove('selected', 'wrong-match');
            }, 500);
            
            document.getElementById('matching-feedback').innerHTML = `
                <div class="feedback incorrect">
                    <h4>❌ 匹配失败</h4>
                    <p>请重新选择正确的匹配项。</p>
                </div>
            `;
        }
        
        this.gameState.selectedLeftItem = null;
        this.gameState.selectedRightItem = null;
    }

    loadPoetryModule(content) {
        document.getElementById('poetry-module').classList.remove('hidden');
        
        const poems = content.poems;
        this.gameState.totalQuestions += this.countTotalBlanks(poems);
        this.gameState.currentPoemIndex = 0;
        this.gameState.filledBlanks = [];
        this.gameState.currentPoemBlanks = [];
        
        document.getElementById('poetry-total').textContent = poems.length;
        
        this.showPoem(this.gameState.currentPoemIndex);
    }

    countTotalBlanks(poems) {
        let count = 0;
        poems.forEach(poem => {
            count += poem.blanks.length;
        });
        return count;
    }

    showPoem(index) {
        const content = this.gameState.gameData.content;
        const poems = content.poems;
        
        if (index >= poems.length) {
            this.nextLevel();
            return;
        }
        
        document.getElementById('poetry-current').textContent = index + 1;
        
        const poem = poems[index];
        document.getElementById('poetry-title').textContent = poem.title;
        document.getElementById('poetry-author').textContent = poem.author;
        
        this.gameState.currentPoemBlanks = [...poem.blanks];
        this.gameState.filledBlanks = new Array(poem.blanks.length).fill(null);
        
        this.renderPoemLines(poem);
        this.renderBlankOptions(poem);
        
        document.getElementById('poetry-feedback').innerHTML = '';
        document.getElementById('poetry-next').classList.add('hidden');
    }

    renderPoemLines(poem) {
        const linesContainer = document.getElementById('poem-lines');
        linesContainer.innerHTML = '';
        
        poem.lines.forEach((line, lineIndex) => {
            const lineElement = document.createElement('div');
            lineElement.className = 'poem-line';
            
            const blanksInLine = poem.blanks.filter(b => b.lineIndex === lineIndex);
            
            if (blanksInLine.length === 0) {
                lineElement.textContent = line;
            } else {
                const chars = line.split('');
                let html = '';
                
                chars.forEach((char, idx) => {
                    const blank = blanksInLine.find(b => b.position === idx);
                    if (blank) {
                        const blankIndex = poem.blanks.indexOf(blank);
                        html += `<span class="blank-word" data-blank-index="${blankIndex}">___</span>`;
                    } else {
                        html += char;
                    }
                });
                
                lineElement.innerHTML = html;
            }
            
            linesContainer.appendChild(lineElement);
        });
    }

    renderBlankOptions(poem) {
        const optionsArea = document.getElementById('options-area');
        optionsArea.innerHTML = '';
        
        const allOptions = [];
        poem.blanks.forEach(blank => {
            blank.options.forEach(option => {
                if (!allOptions.includes(option)) {
                    allOptions.push(option);
                }
            });
        });
        
        const shuffledOptions = this.shuffleArray(allOptions);
        
        shuffledOptions.forEach(option => {
            const btn = document.createElement('button');
            btn.className = 'word-option';
            btn.textContent = option;
            btn.addEventListener('click', () => this.selectWordOption(option, poem));
            optionsArea.appendChild(btn);
        });
    }

    selectWordOption(word, poem) {
        const nextBlankIndex = this.gameState.filledBlanks.findIndex(b => b === null);
        
        if (nextBlankIndex === -1) return;
        
        const blank = poem.blanks[nextBlankIndex];
        const blankElement = document.querySelector(`[data-blank-index="${nextBlankIndex}"]`);
        
        this.gameState.filledBlanks[nextBlankIndex] = word;
        blankElement.textContent = word;
        blankElement.classList.add('filled');
        
        const wordOption = Array.from(document.querySelectorAll('.word-option'))
            .find(opt => opt.textContent === word && !opt.classList.contains('used'));
        if (wordOption) {
            wordOption.classList.add('used');
        }
        
        const allFilled = this.gameState.filledBlanks.every(b => b !== null);
        if (allFilled) {
            this.checkPoemAnswers(poem);
        }
    }

    checkPoemAnswers(poem) {
        let allCorrect = true;
        const wrongAnswers = [];
        
        poem.blanks.forEach((blank, index) => {
            const userAnswer = this.gameState.filledBlanks[index];
            const blankElement = document.querySelector(`[data-blank-index="${index}"]`);
            
            if (userAnswer === blank.missingWord) {
                blankElement.classList.add('correct');
                this.gameState.correctAnswers++;
                this.gameState.score += 20;
                this.gameState.currentStreak++;
                if (this.gameState.currentStreak > this.gameState.maxStreak) {
                    this.gameState.maxStreak = this.gameState.currentStreak;
                }
            } else {
                blankElement.classList.add('incorrect');
                blankElement.title = `正确答案：${blank.missingWord}`;
                blankElement.textContent = blank.missingWord;
                blankElement.classList.remove('incorrect');
                blankElement.classList.add('correct');
                this.gameState.currentStreak = 0;
                
                wrongAnswers.push({
                    userAnswer: userAnswer,
                    correctAnswer: blank.missingWord,
                    position: index + 1
                });
                
                allCorrect = false;
            }
        });
        
        document.getElementById('culture-score').textContent = this.gameState.score;
        
        if (allCorrect) {
            document.getElementById('poetry-feedback').innerHTML = `
                <div class="feedback correct">
                    <h4>✅ 全部正确！${this.gameState.currentStreak > 1 ? ` (${this.gameState.currentStreak}连击!)` : ''}</h4>
                    <p>你完美地完成了这首诗词的填空！</p>
                </div>
            `;
        } else {
            let wrongDetails = wrongAnswers.map(w => 
                `第${w.position}空：你的答案「${w.userAnswer}」，正确答案「${w.correctAnswer}」`
            ).join('<br>');
            
            document.getElementById('poetry-feedback').innerHTML = `
                <div class="feedback incorrect">
                    <h4>❌ 部分错误</h4>
                    <p><strong>已自动显示正确答案（绿色）：</strong></p>
                    <p>${wrongDetails}</p>
                </div>
            `;
        }
        
        document.getElementById('poetry-next').classList.remove('hidden');
    }

    nextPoem() {
        this.gameState.currentPoemIndex++;
        this.showPoem(this.gameState.currentPoemIndex);
    }

    loadTimelineModule(content) {
        document.getElementById('timeline-module').classList.remove('hidden');
        
        const solarTerms = content.solarTerms;
        this.gameState.totalQuestions += solarTerms.length;
        
        this.gameState.timelineState = {
            placedTerms: {},
            correctOrder: solarTerms.map(t => t.name),
            shuffledTerms: this.shuffleArray([...solarTerms]),
            perfectTimeline: false
        };
        
        document.getElementById('timeline-total').textContent = solarTerms.length;
        document.getElementById('timeline-count').textContent = '0';
        
        this.renderTimelineSlots(solarTerms);
        this.renderSolarTermsPool();
        
        document.getElementById('timeline-feedback').innerHTML = '';
    }

    renderTimelineSlots(solarTerms) {
        const slotsContainer = document.getElementById('timeline-slots');
        slotsContainer.innerHTML = '';
        
        solarTerms.forEach((term, index) => {
            const slot = document.createElement('div');
            slot.className = 'timeline-slot';
            slot.dataset.slotIndex = index;
            slot.dataset.correctTerm = term.name;
            
            slot.innerHTML = `
                <div class="slot-dot" data-slot-index="${index}"></div>
                <div class="slot-label">第${index + 1}位</div>
            `;
            
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                slot.classList.add('slot-dragover');
            });
            slot.addEventListener('dragleave', (e) => {
                if (!slot.contains(e.relatedTarget)) {
                    slot.classList.remove('slot-dragover');
                }
            });
            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                slot.classList.remove('slot-dragover');
                const termName = e.dataTransfer.getData('text/plain');
                if (termName) {
                    this.placeTerm(termName, index);
                }
            });
            const dot = slot.querySelector('.slot-dot');
            dot.addEventListener('click', () => {
                this.showTermDetail(term);
            });
            
            slotsContainer.appendChild(slot);
        });
    }

    renderSolarTermsPool() {
        const poolContainer = document.getElementById('solar-terms-items');
        poolContainer.innerHTML = '';
        
        this.gameState.timelineState.shuffledTerms.forEach((term, index) => {
            const item = document.createElement('div');
            item.className = 'solar-term-item';
            item.draggable = true;
            item.dataset.termName = term.name;
            
            item.innerHTML = `
                <span class="term-name">${term.name}</span>
                <span class="term-date">${term.date}</span>
            `;
            
            item.addEventListener('dragstart', (e) => {
                item.classList.add('dragging');
                e.dataTransfer.setData('text/plain', term.name);
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });
            item.addEventListener('click', () => {
                this.showTermDetail(term);
            });
            
            poolContainer.appendChild(item);
        });
    }

    placeTerm(termName, slotIndex) {
        const placedTerms = this.gameState.timelineState.placedTerms;
        
        if (placedTerms[slotIndex]) {
            this.returnTermToPool(placedTerms[slotIndex]);
        }
        
        const existingSlot = Object.keys(placedTerms).find(k => placedTerms[k] === termName);
        if (existingSlot) {
            delete placedTerms[existingSlot];
            const oldDot = document.querySelector(`[data-slot-index="${existingSlot}"] .slot-dot`);
            if (oldDot) {
                oldDot.classList.remove('has-term');
                const oldPlaced = document.querySelector(`[data-slot-index="${existingSlot}"] .placed-term`);
                if (oldPlaced) oldPlaced.remove();
            }
        }
        
        placedTerms[slotIndex] = termName;
        
        const item = document.querySelector(`.solar-term-item[data-term-name="${termName}"]`);
        if (item) {
            item.style.display = 'none';
        }
        
        const slot = document.querySelector(`[data-slot-index="${slotIndex}"]`);
        const dot = slot.querySelector('.slot-dot');
        dot.classList.add('has-term');
        
        const oldPlaced = slot.querySelector('.placed-term');
        if (oldPlaced) oldPlaced.remove();
        
        const placedLabel = document.createElement('div');
        placedLabel.className = 'placed-term';
        placedLabel.textContent = termName;
        placedLabel.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showTermDetailByName(termName);
        });
        slot.appendChild(placedLabel);
        
        document.getElementById('timeline-count').textContent = Object.keys(placedTerms).length;
        
        if (Object.keys(placedTerms).length === this.gameState.timelineState.correctOrder.length) {
            document.getElementById('timeline-next').classList.remove('hidden');
        }
    }

    returnTermToPool(termName) {
        const item = document.querySelector(`.solar-term-item[data-term-name="${termName}"]`);
        if (item) {
            item.style.display = '';
        }
    }

    showTermDetailByName(termName) {
        const content = this.gameState.gameData.content;
        const term = content.solarTerms.find(t => t.name === termName);
        if (term) {
            this.showTermDetail(term);
        }
    }

    showTermDetail(term) {
        document.getElementById('term-detail-name').textContent = term.name;
        document.getElementById('term-detail-date').textContent = term.date + ' (' + term.english + ')';
        document.getElementById('term-detail-desc').textContent = term.description;
        
        const phenologyContainer = document.getElementById('term-detail-phenology');
        phenologyContainer.innerHTML = '';
        if (term.phenology && term.phenology.length > 0) {
            term.phenology.forEach(p => {
                const tag = document.createElement('span');
                tag.className = 'tag';
                tag.textContent = p;
                phenologyContainer.appendChild(tag);
            });
        } else {
            phenologyContainer.innerHTML = '<span class="tag">暂无</span>';
        }
        
        const customsContainer = document.getElementById('term-detail-customs');
        customsContainer.innerHTML = '';
        if (term.customs && term.customs.length > 0) {
            term.customs.forEach(c => {
                const tag = document.createElement('span');
                tag.className = 'tag';
                tag.textContent = c;
                customsContainer.appendChild(tag);
            });
        } else {
            customsContainer.innerHTML = '<span class="tag">暂无</span>';
        }
        
        document.getElementById('term-detail-modal').classList.remove('hidden');
    }

    checkTimelineAndProceed() {
        const placedTerms = this.gameState.timelineState.placedTerms;
        const correctOrder = this.gameState.timelineState.correctOrder;
        
        let correctCount = 0;
        let allCorrect = true;
        
        correctOrder.forEach((termName, index) => {
            const placed = placedTerms[index];
            const slot = document.querySelector(`[data-slot-index="${index}"]`);
            const placedLabel = slot.querySelector('.placed-term');
            
            if (placed === termName) {
                correctCount++;
                if (placedLabel) {
                    placedLabel.classList.add('correct');
                    placedLabel.classList.remove('incorrect');
                }
            } else {
                allCorrect = false;
                if (placedLabel) {
                    placedLabel.classList.add('incorrect');
                    placedLabel.classList.remove('correct');
                }
            }
        });
        
        this.gameState.timelineState.perfectTimeline = allCorrect;
        
        this.gameState.correctAnswers += correctCount;
        this.gameState.score += correctCount * 25;
        
        if (allCorrect) {
            this.gameState.currentStreak += correctCount;
            if (this.gameState.currentStreak > this.gameState.maxStreak) {
                this.gameState.maxStreak = this.gameState.currentStreak;
            }
        }
        
        document.getElementById('culture-score').textContent = this.gameState.score;
        
        if (allCorrect) {
            document.getElementById('timeline-feedback').innerHTML = `
                <div class="feedback correct">
                    <h4>🎉 完美！全部正确！</h4>
                    <p>你完美地掌握了二十四节气的时间顺序！</p>
                    <p>获得 ${correctCount * 25} 分文化灵识</p>
                </div>
            `;
        } else {
            document.getElementById('timeline-feedback').innerHTML = `
                <div class="feedback incorrect">
                    <h4>⏰ 时间线检查完成</h4>
                    <p>正确: ${correctCount}/${correctOrder.length}</p>
                    <p>获得 ${correctCount * 25} 分文化灵识</p>
                    <p><em>绿色标记为正确，红色标记为错误位置</em></p>
                </div>
            `;
        }
        
        document.getElementById('timeline-next').textContent = '查看结果 →';
        document.getElementById('timeline-next').onclick = () => this.showVictory();
    }

    async nextLevel() {
        this.gameState.currentLevel++;
        this.gameState.currentQuestionIndex = 0;
        this.gameState.currentPoemIndex = 0;
        
        if (this.gameState.currentLevel > 4) {
            await this.showVictory();
        } else {
            await this.loadLevelData();
        }
    }

    async showVictory() {
        const medalInfo = this.awardMedal();
        
        const response = await fetch(`/api/secret-message?difficulty=${this.gameState.difficulty}&medal=${encodeURIComponent(medalInfo.name)}`);
        const data = await response.json();
        
        document.getElementById('medal-name').textContent = medalInfo.name;
        document.getElementById('medal-desc').textContent = medalInfo.description;
        document.getElementById('awarded-medal').style.background = medalInfo.color;
        document.getElementById('awarded-medal').textContent = '🏅';
        document.getElementById('secret-message').textContent = data.message;
        
        document.getElementById('final-score').textContent = this.gameState.score;
        document.getElementById('final-correct').textContent = this.gameState.correctAnswers;
        
        const difficultyNames = {
            'easy': '简单',
            'medium': '难度升级',
            'hard': '超级难'
        };
        document.getElementById('final-difficulty').textContent = difficultyNames[this.gameState.difficulty];
        
        const elapsedTime = this.gameState.startTime ? Math.floor((Date.now() - this.gameState.startTime) / 1000) : null;
        
        if (this.gameState.userId) {
            try {
                await fetch('/api/progress', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        userId: this.gameState.userId,
                        difficulty: this.gameState.difficulty,
                        score: this.gameState.score,
                        streak: this.gameState.maxStreak,
                        won: true,
                        perfectTimeline: this.gameState.timelineState.perfectTimeline,
                        medalId: medalInfo.id,
                        elapsedTime: elapsedTime
                    })
                });
            } catch (error) {
                console.error('提交进度失败:', error);
            }
        }
        
        this.renderVictoryLeaderboard();
        
        this.saveGameProgress();
        this.showScreen('victory');
    }

    awardMedal() {
        const medals = {
            'easy': {
                id: 'bronze',
                name: '青铜探索者',
                description: '完成简单难度四关',
                color: '#cd7f32'
            },
            'medium': {
                id: 'silver',
                name: '白银守护者',
                description: '完成难度升级四关',
                color: '#c0c0c0'
            },
            'hard': {
                id: 'gold',
                name: '黄金传承人',
                description: '完成超级难四关',
                color: '#ffd700'
            }
        };
        
        const medal = medals[this.gameState.difficulty];
        
        if (!this.gameState.medals.find(m => m.id === medal.id)) {
            this.gameState.medals.push(medal);
        }
        
        return medal;
    }

    updateMedalsDisplay() {
        const display = document.getElementById('medals-display');
        
        const allMedals = [
            {
                id: 'bronze',
                name: '青铜探索者',
                description: '完成简单难度四关',
                color: '#cd7f32'
            },
            {
                id: 'silver',
                name: '白银守护者',
                description: '完成难度升级四关',
                color: '#c0c0c0'
            },
            {
                id: 'gold',
                name: '黄金传承人',
                description: '完成超级难四关',
                color: '#ffd700'
            }
        ];
        
        display.innerHTML = '';
        
        allMedals.forEach(medal => {
            const earned = this.gameState.medals.find(m => m.id === medal.id);
            const medalElement = document.createElement('div');
            medalElement.className = `medal-item ${earned ? '' : 'locked'}`;
            medalElement.innerHTML = `
                <span class="medal-icon" style="background: ${medal.color};">🏅</span>
                <span class="medal-name">${earned ? medal.name : '???'}</span>
            `;
            display.appendChild(medalElement);
        });
    }

    confirmExit() {
        this.showModal(
            '确认退出',
            '确定要退出当前游戏吗？当前进度将不会保存。',
            () => {
                this.showScreen('difficulty');
            }
        );
    }

    showModal(title, message, onConfirm = null) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-message').textContent = message;
        document.getElementById('modal').classList.remove('hidden');
        
        this._modalCallback = onConfirm;
    }

    hideModal() {
        document.getElementById('modal').classList.add('hidden');
        
        if (this._modalCallback) {
            this._modalCallback();
            this._modalCallback = null;
        }
    }

    restartGame() {
        this.selectDifficulty(this.gameState.difficulty);
    }

    shuffleArray(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.game = new SolarTermGame();
});
