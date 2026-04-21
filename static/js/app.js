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
            filledBlanks: []
        };
        
        this.init();
    }

    init() {
        this.loadGameProgress();
        this.bindEvents();
        this.updateMedalsDisplay();
        this.checkGameReady();
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

    bindEvents() {
        document.getElementById('start-btn').addEventListener('click', () => this.showScreen('difficulty'));
        document.getElementById('back-to-start').addEventListener('click', () => this.showScreen('start'));
        document.getElementById('exit-game').addEventListener('click', () => this.confirmExit());
        document.getElementById('quiz-next').addEventListener('click', () => this.nextQuizQuestion());
        document.getElementById('matching-next').addEventListener('click', () => this.nextLevel());
        document.getElementById('poetry-next').addEventListener('click', () => this.nextPoem());
        document.getElementById('play-again').addEventListener('click', () => this.restartGame());
        document.getElementById('back-to-menu').addEventListener('click', () => this.showScreen('difficulty'));
        
        document.querySelectorAll('.difficulty-card').forEach(card => {
            card.addEventListener('click', () => this.selectDifficulty(card.dataset.difficulty));
        });
        
        document.getElementById('modal-close').addEventListener('click', () => this.hideModal());
        document.getElementById('modal-confirm').addEventListener('click', () => this.hideModal());
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
    }

    async selectDifficulty(difficulty) {
        this.gameState.difficulty = difficulty;
        this.gameState.currentLevel = 1;
        this.gameState.correctAnswers = 0;
        this.gameState.totalQuestions = 0;
        this.gameState.currentQuestionIndex = 0;
        this.gameState.currentPoemIndex = 0;
        
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
        
        document.getElementById('quiz-next').classList.add('hidden');
        document.getElementById('matching-next').classList.add('hidden');
        document.getElementById('poetry-next').classList.add('hidden');
        
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
            document.getElementById('culture-score').textContent = this.gameState.score;
            
            document.getElementById('quiz-feedback').innerHTML = `
                <div class="feedback correct">
                    <h4>✅ 回答正确！</h4>
                    <p>${explanation}</p>
                </div>
            `;
        } else {
            options[selectedIndex].classList.add('incorrect');
            options[correctIndex].classList.add('correct');
            
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
            document.getElementById('culture-score').textContent = this.gameState.score;
            
            this.gameState.matchedPairs.push(left.pair);
            document.getElementById('match-count').textContent = this.gameState.matchedPairs.length;
            
            document.getElementById('matching-feedback').innerHTML = `
                <div class="feedback correct">
                    <h4>✅ 匹配成功！</h4>
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
            this.showVictory();
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
                let charIndex = 0;
                
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
        
        poem.blanks.forEach((blank, index) => {
            const userAnswer = this.gameState.filledBlanks[index];
            const blankElement = document.querySelector(`[data-blank-index="${index}"]`);
            
            if (userAnswer === blank.missingWord) {
                blankElement.classList.add('correct');
                this.gameState.correctAnswers++;
                this.gameState.score += 20;
            } else {
                blankElement.classList.add('incorrect');
                allCorrect = false;
            }
        });
        
        document.getElementById('culture-score').textContent = this.gameState.score;
        
        if (allCorrect) {
            document.getElementById('poetry-feedback').innerHTML = `
                <div class="feedback correct">
                    <h4>✅ 全部正确！</h4>
                    <p>你完美地完成了这首诗词的填空！</p>
                </div>
            `;
        } else {
            document.getElementById('poetry-feedback').innerHTML = `
                <div class="feedback incorrect">
                    <h4>❌ 部分错误</h4>
                    <p>请查看红色标注的错误答案，绿色为正确答案。</p>
                </div>
            `;
        }
        
        document.getElementById('poetry-next').classList.remove('hidden');
    }

    nextPoem() {
        this.gameState.currentPoemIndex++;
        this.showPoem(this.gameState.currentPoemIndex);
    }

    async nextLevel() {
        this.gameState.currentLevel++;
        this.gameState.currentQuestionIndex = 0;
        this.gameState.currentPoemIndex = 0;
        
        if (this.gameState.currentLevel > 3) {
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
        
        this.saveGameProgress();
        this.showScreen('victory');
    }

    awardMedal() {
        const medals = {
            'easy': {
                id: 'bronze',
                name: '青铜探索者',
                description: '完成简单难度三关',
                color: '#cd7f32'
            },
            'medium': {
                id: 'silver',
                name: '白银守护者',
                description: '完成难度升级三关',
                color: '#c0c0c0'
            },
            'hard': {
                id: 'gold',
                name: '黄金传承人',
                description: '完成超级难度三关',
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
                description: '完成简单难度三关',
                color: '#cd7f32'
            },
            {
                id: 'silver',
                name: '白银守护者',
                description: '完成难度升级三关',
                color: '#c0c0c0'
            },
            {
                id: 'gold',
                name: '黄金传承人',
                description: '完成超级难度三关',
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
