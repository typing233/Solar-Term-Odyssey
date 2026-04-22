from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import os
import json
import sqlite3
from datetime import datetime
import uuid
from typing import Dict, List, Any

app = Flask(__name__)
CORS(app)

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

DB_PATH = os.path.join(DATA_DIR, 'game.db')

with open(os.path.join(STATIC_DIR, 'data', 'game_data.json'), 'r', encoding='utf-8') as f:
    game_data = json.load(f)


def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS game_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            difficulty TEXT,
            total_score INTEGER DEFAULT 0,
            total_wins INTEGER DEFAULT 0,
            max_streak INTEGER DEFAULT 0,
            best_time INTEGER,
            timeline_perfect INTEGER DEFAULT 0,
            medals TEXT DEFAULT '[]',
            achievements TEXT DEFAULT '[]',
            last_played TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS leaderboard (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            user_name TEXT DEFAULT '匿名探索者',
            difficulty TEXT,
            score INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_leaderboard_difficulty ON leaderboard(difficulty, score DESC)')
    
    conn.commit()
    conn.close()


init_db()


def get_or_create_user(user_id=None):
    if not user_id:
        user_id = str(uuid.uuid4())
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('SELECT id FROM users WHERE id = ?', (user_id,))
    existing = cursor.fetchone()
    
    if not existing:
        cursor.execute('INSERT INTO users (id) VALUES (?)', (user_id,))
        
        for diff in ['easy', 'medium', 'hard']:
            cursor.execute('''
                INSERT INTO game_progress 
                (user_id, difficulty, total_score, total_wins, max_streak, timeline_perfect, medals, achievements)
                VALUES (?, ?, 0, 0, 0, 0, '[]', '[]')
            ''', (user_id, diff))
        
        conn.commit()
    
    conn.close()
    return user_id


def update_progress(user_id: str, difficulty: str, score: int, streak: int, won: bool, 
                 perfect_timeline: bool = False, medal_id: str = None,
                 elapsed_time: int = None):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT total_score, total_wins, max_streak, best_time, medals, achievements
        FROM game_progress WHERE user_id = ? AND difficulty = ?
    ''', (user_id, difficulty))
    row = cursor.fetchone()
    
    if row:
        new_total_score = row[0] + score
        new_total_wins = row[1] + (1 if won else 0)
        new_max_streak = max(row[2], streak)
        new_best_time = row[3]
        if elapsed_time and (row[3] is None or elapsed_time < row[3]):
            new_best_time = elapsed_time
        
        medals = json.loads(row[4]) if row[4] else []
        if medal_id and medal_id not in medals:
            medals.append(medal_id)
        
        achievements = json.loads(row[5]) if row[5] else []
        
        timeline_perfect = 0 if perfect_timeline else 0
        
        cursor.execute('''
            UPDATE game_progress SET
                total_score = ?,
                total_wins = ?,
                max_streak = ?,
                best_time = ?,
                timeline_perfect = timeline_perfect + ?,
                medals = ?,
                last_played = CURRENT_TIMESTAMP
            WHERE user_id = ? AND difficulty = ?
        ''', (new_total_score, new_total_wins, new_max_streak, 
                new_best_time, timeline_perfect, json.dumps(medals),
                user_id, difficulty))
        
        unlocked_achievements = check_achievements(cursor, user_id, difficulty)
        for ach_id in unlocked_achievements:
            if ach_id not in achievements:
                achievements.append(ach_id)
        
        cursor.execute('''
            UPDATE game_progress SET achievements = ? WHERE user_id = ? AND difficulty = ?
        ''', (json.dumps(achievements), user_id, difficulty))
    
    conn.commit()
    conn.close()
    
    if won:
        add_to_leaderboard(user_id, difficulty, score)


def check_achievements(cursor, user_id: str, difficulty: str) -> List[str]:
    unlocked = []
    
    cursor.execute('''
        SELECT gp.total_score, gp.total_wins, gp.max_streak, gp.timeline_perfect,
               (SELECT COUNT(*) FROM game_progress gp2 
               WHERE gp2.user_id = gp.user_id AND json_array_length(gp2.medals) > 0) as has_medals
        FROM game_progress gp
        WHERE gp.user_id = ?
    ''', (user_id,))
    rows = cursor.fetchall()
    
    all_medals_count = 0
    total_wins_all = 0
    max_streak_all = 0
    
    for row in rows:
        total_wins_all += row[1]
        if row[2] > max_streak_all:
            max_streak_all = row[2]
        if row[4] > 0:
            all_medals_count += 1
    
    achievements = game_data.get('achievements', [])
    
    for ach in achievements:
        condition = ach.get('unlockCondition', {})
        cond_type = condition.get('type')
        
        if cond_type == 'totalWins' and total_wins_all >= condition.get('value', 1):
            unlocked.append(ach['id'])
        elif cond_type == 'totalScore':
            target_diff = condition.get('difficulty')
            for row in rows:
                if row and row[0] >= condition.get('value', 0):
                    unlocked.append(ach['id'])
                    break
        elif cond_type == 'maxStreak' and max_streak_all >= condition.get('value', 0):
            unlocked.append(ach['id'])
        elif cond_type == 'allMedals' and all_medals_count >= 3:
            unlocked.append(ach['id'])
        elif cond_type == 'timelinePerfect':
            for row in rows:
                if row and row[3] > 0:
                    unlocked.append(ach['id'])
                    break
    
    return list(set(unlocked))


def add_to_leaderboard(user_id: str, difficulty: str, score: int):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO leaderboard (user_id, difficulty, score)
        VALUES (?, ?, ?)
    ''', (user_id, difficulty, score))
    
    conn.commit()
    conn.close()


def get_leaderboard(difficulty: str, limit: int = 10) -> List[Dict]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT user_id, user_name, score, created_at
        FROM leaderboard
        WHERE difficulty = ?
        ORDER BY score DESC, created_at ASC
        LIMIT ?
    ''', (difficulty, limit))
    
    rows = cursor.fetchall()
    result = []
    for i, row in enumerate(rows):
        result.append({
            'rank': i + 1,
            'user_id': row['user_id'],
            'user_name': row['user_name'],
            'score': row['score'],
            'date': row['created_at']
        })
    
    conn.close()
    return result


def get_user_progress(user_id: str) -> Dict[str, Any]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT difficulty, total_score, total_wins, max_streak, 
               best_time, timeline_perfect, medals, achievements, last_played
        FROM game_progress
        WHERE user_id = ?
    ''', (user_id,))
    
    rows = cursor.fetchall()
    
    result = {
        'user_id': user_id,
        'difficulties': {}
    }
    
    total_score_all = 0
    total_wins_all = 0
    max_streak_all = 0
    all_medals = []
    all_achievements = []
    
    for row in rows:
        diff = row['difficulty']
        medals = json.loads(row['medals']) if row['medals'] else []
        achievements = json.loads(row['achievements']) if row['achievements'] else []
        
        result['difficulties'][diff] = {
            'total_score': row['total_score'],
            'total_wins': row['total_wins'],
            'max_streak': row['max_streak'],
            'best_time': row['best_time'],
            'timeline_perfect': row['timeline_perfect'],
            'medals': medals,
            'achievements': achievements,
            'last_played': row['last_played']
        }
        
        total_score_all += row['total_score']
        total_wins_all += row['total_wins']
        if row['max_streak'] > max_streak_all:
            max_streak_all = row['max_streak']
        all_medals.extend(medals)
        all_achievements.extend(achievements)
    
    result['summary'] = {
        'total_score': total_score_all,
        'total_wins': total_wins_all,
        'max_streak': max_streak_all,
        'medals_count': len(set(all_medals)),
        'achievements_count': len(set(all_achievements))
    }
    
    conn.close()
    return result


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/game-data', methods=['GET'])
def get_game_data():
    difficulty = request.args.get('difficulty', 'easy')
    level = request.args.get('level', '1')
    
    difficulty_map = {
        'easy': '简单',
        'medium': '难度升级',
        'hard': '超级难'
    }
    
    difficulty_name = difficulty_map.get(difficulty, '简单')
    
    response = {
        'difficulty': difficulty_name,
        'level': int(level),
        'content': {}
    }
    
    if level == '1':
        response['content']['gameType'] = 'quiz'
        response['content']['title'] = '物候问答'
        response['content']['description'] = '选择正确的物候现象与节气对应'
        response['content']['questions'] = game_data['easy']['quiz']['questions'][:3] if difficulty == 'easy' else \
                                           game_data['medium']['quiz']['questions'][:3] if difficulty == 'medium' else \
                                           game_data['hard']['quiz']['questions'][:3]
    elif level == '2':
        response['content']['gameType'] = 'matching'
        response['content']['title'] = '民俗匹配'
        response['content']['description'] = '将民俗活动与对应的节气进行匹配'
        response['content']['pairs'] = game_data['easy']['matching']['pairs'][:4] if difficulty == 'easy' else \
                                       game_data['medium']['matching']['pairs'][:4] if difficulty == 'medium' else \
                                       game_data['hard']['matching']['pairs'][:4]
    elif level == '3':
        response['content']['gameType'] = 'poetry'
        response['content']['title'] = '诗词填空'
        response['content']['description'] = '点击选择正确的字词填入诗句空白处'
        response['content']['poems'] = game_data['easy']['poetry']['poems'][:2] if difficulty == 'easy' else \
                                       game_data['medium']['poetry']['poems'][:2] if difficulty == 'medium' else \
                                       game_data['hard']['poetry']['poems'][:2]
    elif level == '4':
        response['content']['gameType'] = 'timeline'
        response['content']['title'] = '节气时间线探索'
        response['content']['description'] = '按时间顺序将节气拖拽到正确的位置，了解二十四节气的时间序列'
        
        count_map = {
            'easy': 6,
            'medium': 12,
            'hard': 24
        }
        count = count_map.get(difficulty, 6)
        
        solar_terms = game_data.get('solar_terms', [])
        selected_terms = solar_terms[:count] if count <= len(solar_terms) else solar_terms
        
        response['content']['solarTerms'] = []
        for term in selected_terms:
            response['content']['solarTerms'].append({
                'name': term['name'],
                'english': term['english'],
                'date': term['date'],
                'description': term['description'],
                'customs': term.get('customs', []),
                'phenology': term.get('phenology', [])
            })
    
    return jsonify(response)


@app.route('/api/medals', methods=['GET'])
def get_medals():
    return jsonify(game_data['medals'])


@app.route('/api/achievements', methods=['GET'])
def get_achievements():
    return jsonify(game_data.get('achievements', []))


@app.route('/api/secret-message', methods=['GET'])
def get_secret_message():
    difficulty = request.args.get('difficulty', 'easy')
    medal = request.args.get('medal', '')
    
    messages = game_data['secret_messages']
    message_template = messages.get(difficulty, messages['easy'])
    
    message = message_template.format(
        date=datetime.now().strftime('%Y年%m月%d日'),
        medal=medal
    )
    
    return jsonify({
        'message': message,
        'medal': medal
    })


@app.route('/api/progress', methods=['GET'])
def get_progress():
    user_id = request.args.get('userId', '')
    
    if not user_id:
        user_id = get_or_create_user()
        return jsonify({
            'success': True,
            'userId': user_id,
            'message': '新用户已创建'
        })
    
    progress = get_user_progress(user_id)
    return jsonify({
        'success': True,
        'data': progress
    })


@app.route('/api/progress', methods=['POST'])
def update_progress_api():
    data = request.get_json() or {}
    
    user_id = data.get('userId', '')
    if not user_id:
        return jsonify({'success': False, 'message': '缺少userId'}), 400
    
    user_id = get_or_create_user(user_id)
    
    difficulty = data.get('difficulty', 'easy')
    score = data.get('score', 0)
    streak = data.get('streak', 0)
    won = data.get('won', False)
    perfect_timeline = data.get('perfectTimeline', False)
    medal_id = data.get('medalId')
    elapsed_time = data.get('elapsedTime')
    
    update_progress(
        user_id=user_id,
        difficulty=difficulty,
        score=score,
        streak=streak,
        won=won,
        perfect_timeline=perfect_timeline,
        medal_id=medal_id,
        elapsed_time=elapsed_time
    )
    
    progress = get_user_progress(user_id)
    return jsonify({
        'success': True,
        'message': '进度已更新',
        'data': progress
    })


@app.route('/api/leaderboard', methods=['GET'])
def leaderboard():
    difficulty = request.args.get('difficulty', 'easy')
    limit = int(request.args.get('limit', 10))
    user_id = request.args.get('userId', '')
    
    leaderboard_data = get_leaderboard(difficulty, limit)
    
    user_rank = None
    if user_id:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT score, created_at
            FROM leaderboard
            WHERE user_id = ? AND difficulty = ?
            ORDER BY score DESC
            LIMIT 1
        ''', (user_id, difficulty))
        
        user_best = cursor.fetchone()
        
        if user_best:
            cursor.execute('''
                SELECT COUNT(*) + 1 as rank
                FROM leaderboard l1
                WHERE l1.difficulty = ? AND (
                    l1.score > ? OR 
                    (l1.score = ? AND l1.created_at <= ?)
                )
            ''', (difficulty, user_best['score'], user_best['score'], user_best['created_at']))
            
            rank_row = cursor.fetchone()
            if rank_row:
                user_rank = {
                    'rank': rank_row['rank'],
                    'score': user_best['score'],
                    'date': user_best['created_at']
                }
        
        conn.close()
    
    return jsonify({
        'success': True,
        'difficulty': difficulty,
        'leaderboard': leaderboard_data,
        'userRank': user_rank
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9832, debug=True)
