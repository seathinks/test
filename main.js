// main.js
(async function() {
    'use strict';

    // --- 設定項目 ---
    // GitHub Pagesのリポジトリに合わせてURLを変更してください
    const GITHUB_USER = "seathinks"; // あなたのGitHubユーザー名
    const GITHUB_REPO = "test"; // あなたのリポジトリ名
    const CONST_DATA_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main/chunirec.json`;

    // --- 定数 ---
    const BASE_URL = "https://new.chunithm-net.com/chuni-mobile/html/mobile/";
    const URL_PLAYER_DATA = BASE_URL + "home/playerData/";
    const URL_RATING_BEST = URL_PLAYER_DATA + "ratingDetailBest/";
    const URL_RATING_RECENT = URL_PLAYER_DATA + "ratingDetailRecent/";
    const URL_SEND_DETAIL = BASE_URL + "record/musicGenre/sendMusicDetail/";
    const URL_DETAIL = BASE_URL + "record/musicDetail/";

    // --- UIの準備 ---
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.8); z-index: 9999; display: flex;
        justify-content: center; align-items: center; color: white;
        font-family: sans-serif;
    `;
    const message = document.createElement('p');
    message.style.fontSize = "20px";
    message.textContent = "レーティングデータの取得を開始します...";
    overlay.appendChild(message);
    document.body.appendChild(overlay);

    const updateMessage = (text) => {
        console.log(text);
        message.textContent = text;
    };

    /**
     * 指定されたURLからHTMLドキュメントを取得する
     * @param {string} url - 取得先のURL
     * @returns {Promise<Document>} - パースされたHTMLドキュメント
     */
    const fetchDocument = async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for ${url}`);
        const htmlText = await response.text();
        return new DOMParser().parseFromString(htmlText, 'text/html');
    };

    /**
     * レーティング対象曲のリストをスクレイピングする
     * @param {string} url - Best枠またはRecent枠のURL
     * @returns {Promise<Array<Object>>} - 曲情報の配列
     */
    const scrapeRatingList = async (url) => {
        const doc = await fetchDocument(url);
        const songForms = doc.querySelectorAll('form[action$="sendMusicDetail/"]');
        const songs = [];
        for (const form of songForms) {
            const difficultyClass = form.querySelector('div[class*="bg_"]').className;
            let difficulty = "UNKNOWN";
            if (difficultyClass.includes("master")) difficulty = "MASTER";
            else if (difficultyClass.includes("expert")) difficulty = "EXPERT";
            else if (difficultyClass.includes("ultima")) difficulty = "ULTIMA";

            songs.push({
                title: form.querySelector('.music_title').innerText,
                score_str: form.querySelector('.text_b').innerText,
                score_int: parseInt(form.querySelector('.text_b').innerText.replace(/,/g, ''), 10),
                difficulty: difficulty,
                params: { // 詳細ページ取得用のパラメータ
                    idx: form.querySelector('input[name="idx"]').value,
                    token: form.querySelector('input[name="token"]').value,
                    genre: form.querySelector('input[name="genre"]').value,
                    diff: form.querySelector('input[name="diff"]').value,
                }
            });
        }
        return songs;
    };

    /**
     * 曲の詳細情報をスクレイピングする
     * @param {Object} params - 詳細ページ取得用のパラメータ
     * @returns {Promise<Object>} - アーティスト名、ジャケットURL、プレイ回数
     */
    const scrapeMusicDetail = async (params) => {
        const formData = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => formData.append(key, value));

        await fetch(URL_SEND_DETAIL, { method: 'POST', body: formData });
        const doc = await fetchDocument(URL_DETAIL);

        const artist = doc.querySelector('.play_musicdata_artist')?.innerText || 'N/A';
        const jacketUrl = doc.querySelector('.play_jacket_img img')?.src || '';
        
        // 選択中の難易度のプレイ回数を取得
        const difficultyMap = { '0': 'basic', '1': 'advanced', '2': 'expert', '3': 'master', '4': 'ultima' };
        const currentDiffClass = `.bg_${difficultyMap[params.diff]}`;
        const playCountElement = doc.querySelector(`${currentDiffClass} .musicdata_score_num .text_b`);
        const playCount = playCountElement ? playCountElement.innerText : 'N/A';

        return { artist, jacketUrl, playCount };
    };

    /**
     * スコアと譜面定数からレート値を計算する
     * @param {number} score - スコア
     * @param {number} constant - 譜面定数
     * @returns {number} - レート値
     */
    const calculateRating = (score, constant) => {
        if (!constant) return 0.0;
        constant = parseFloat(constant);
        if (score >= 1009000) return constant + 2.15; // SSS+ (LUMINOUS以降)
        if (score >= 1007500) return constant + 2.0 + (score - 1007500) * 0.0001; // SSS
        if (score >= 1005000) return constant + 1.5 + (score - 1005000) * 0.0002; // SS+
        if (score >= 1000000) return constant + 1.0 + (score - 1000000) * 0.0001; // SS
        if (score >= 975000)  return constant + (score - 975000) / 25000;         // S
        if (score >= 950000)  return constant - 1.5 + (score - 950000) / 25000 * 1.5;
        if (score >= 925000)  return constant - 3.0 + (score - 925000) / 25000 * 1.5;
        if (score >= 900000)  return constant - 5.0 + (score - 900000) / 25000 * 2.0;
        return 0.0;
    };
    
    /**
     * Canvas APIを使って画像を生成する
     */
    const generateImage = async (playerData, bestList, recentList) => {
        // ここに提供されたPythonコードを参考にCanvas APIでの描画処理を実装します。
        // 以下はレイアウトの骨子です。
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const WIDTH = 1200, PADDING = 10, HEADER_HEIGHT = 120;
        const COLS = 5;
        const BLOCK_WIDTH = (WIDTH - PADDING * (COLS + 1)) / COLS;
        const BLOCK_HEIGHT = BLOCK_WIDTH * 1.3;
        
        const calcListHeight = (list) => {
            if (!list.length) return 0;
            const rows = Math.ceil(list.length / COLS);
            return 40 + (rows * (BLOCK_HEIGHT + PADDING)); // 40はタイトル分
        };

        canvas.width = WIDTH;
        canvas.height = HEADER_HEIGHT + calcListHeight(bestList) + calcListHeight(recentList);
        
        // 背景
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // ヘッダー
        ctx.fillStyle = '#333';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(`${playerData.name} (Rating: ${playerData.rating})`, PADDING, 40);
        ctx.font = '16px sans-serif';
        ctx.fillText(`Generated: ${new Date().toLocaleString()}`, PADDING, 70);

        // ジャケット画像の読み込み
        const allSongs = [...bestList, ...recentList];
        const imagePromises = allSongs.map(song => new Promise(resolve => {
            if (!song.jacketUrl) {
                resolve({ ...song, image: null });
                return;
            }
            const img = new Image();
            img.crossOrigin = "anonymous"; // CORS対策
            img.onload = () => resolve({ ...song, image: img });
            img.onerror = () => resolve({ ...song, image: null }); // 失敗しても継続
            img.src = song.jacketUrl.replace('http://', 'https://'); // httpsに統一
        }));
        const songsWithImages = await Promise.all(imagePromises);

        // 楽曲リスト描画関数
        const renderSongList = (title, list, startY) => {
            ctx.fillStyle = '#222';
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText(title, PADDING, startY + 25);
            
            list.forEach((song, i) => {
                const row = Math.floor(i / COLS);
                const col = i % COLS;
                const x = PADDING + col * (BLOCK_WIDTH + PADDING);
                const y = startY + 40 + row * (BLOCK_HEIGHT + PADDING);

                // ブロック背景
                ctx.fillStyle = song.difficulty === 'ULTIMA' ? '#ffc0cb' : '#fff';
                ctx.strokeStyle = '#ccc';
                ctx.lineWidth = 1;
                ctx.fillRect(x, y, BLOCK_WIDTH, BLOCK_HEIGHT);
                ctx.strokeRect(x, y, BLOCK_WIDTH, BLOCK_HEIGHT);

                // ジャケット
                if (song.image) {
                    ctx.drawImage(song.image, x + 5, y + 5, BLOCK_WIDTH - 10, BLOCK_WIDTH - 10);
                } else {
                    ctx.fillStyle = '#666';
                    ctx.fillRect(x + 5, y + 5, BLOCK_WIDTH - 10, BLOCK_WIDTH - 10);
                }
                
                // テキスト
                ctx.fillStyle = '#000';
                ctx.font = '12px sans-serif';
                const titleText = song.title.length > 15 ? song.title.substring(0, 14) + '…' : song.title;
                ctx.fillText(titleText, x + 5, y + BLOCK_WIDTH + 10);
                
                ctx.font = 'bold 14px sans-serif';
                ctx.fillText(`${song.score_str}`, x + 5, y + BLOCK_WIDTH + 30);
                
                ctx.fillStyle = '#d9534f';
                ctx.fillText(`RATING: ${song.rating.toFixed(2)}`, x + 5, y + BLOCK_WIDTH + 50);
            });
        };
        
        const bestStartY = HEADER_HEIGHT;
        const recentStartY = bestStartY + calcListHeight(bestList);
        
        renderSongList("BEST枠", songsWithImages.slice(0, bestList.length), bestStartY);
        renderSongList("新曲枠", songsWithImages.slice(bestList.length), recentStartY);
        
        // 結果表示
        const dataUrl = canvas.toDataURL('image/png');
        const newWindow = window.open();
        newWindow.document.write(`
            <html>
                <head><title>CHUNITHM Rating Result</title></head>
                <body style="margin:0; background:#333;">
                    <img src="${dataUrl}" alt="Rating Image" style="max-width:100%;">
                </body>
            </html>
        `);
    };

    // --- メイン処理 ---
    try {
        updateMessage("プレイヤー情報を取得中...");
        const playerDoc = await fetchDocument(URL_PLAYER_DATA);
        const playerData = {
            name: playerDoc.querySelector('.player_name_in').innerText,
            rating: playerDoc.querySelector('.player_rating_num_block').innerText.replace(/\s/g, ''),
        };

        updateMessage("譜面定数データをダウンロード中...");
        const constData = await fetch(CONST_DATA_URL).then(res => res.json());

        updateMessage("BEST枠の曲リストを取得中...");
        const bestList = await scrapeRatingList(URL_RATING_BEST);
        updateMessage("新曲枠の曲リストを取得中...");
        const recentList = await scrapeRatingList(URL_RATING_RECENT);

        const allSongs = [...bestList, ...recentList];
        const detailedSongs = [];

        for (let i = 0; i < allSongs.length; i++) {
            const song = allSongs[i];
            updateMessage(`詳細情報を取得中... (${i + 1}/${allSongs.length}) ${song.title}`);
            const details = await scrapeMusicDetail(song.params);

            // 譜面定数を検索
            const matchedConst = constData.find(
                m => m.title === song.title && m.difficulty === song.difficulty
            )?.const;
            
            // レート値を計算
            const rating = calculateRating(song.score_int, matchedConst);
            
            detailedSongs.push({ ...song, ...details, 'const': matchedConst || 0.0, rating });
        }
        
        updateMessage("画像生成中...");
        const finalBestList = detailedSongs.slice(0, bestList.length);
        const finalRecentList = detailedSongs.slice(bestList.length);

        await generateImage(playerData, finalBestList, finalRecentList);

        updateMessage("完了！");
        document.body.removeChild(overlay);

    } catch (error) {
        console.error("ブックマークレットの実行中にエラーが発生しました:", error);
        message.textContent = `エラー: ${error.message} (詳細はコンソールを確認してください)`;
        // エラー発生後も5秒後にオーバーレイを消す
        setTimeout(() => document.body.removeChild(overlay), 5000);
    }
})();