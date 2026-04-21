from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import os
import json
from datetime import datetime

app = Flask(__name__)
CORS(app)

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')

with open(os.path.join(STATIC_DIR, 'data', 'game_data.json'), 'r', encoding='utf-8') as f:
    game_data = json.load(f)


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
    
    return jsonify(response)


@app.route('/api/medals', methods=['GET'])
def get_medals():
    return jsonify(game_data['medals'])


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


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9832, debug=True)
