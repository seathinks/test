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

        // --- FINAL CORRECTED LOGIC ---
        let playCount = 'N/A';
        const difficultyMap = { '0': 'basic', '1': 'advanced', '2': 'expert', '3': 'master', '4': 'ultima' };
        const diffSelector = `.music_box.bg_${difficultyMap[params.diff]}`;
        const difficultyBlock = doc.querySelector(diffSelector);

        if (difficultyBlock) {
            // Find all of the data rows within the difficulty block
            const dataRows = difficultyBlock.querySelectorAll('.block_underline.ptb_5');
            for (const row of dataRows) {
                const titleElement = row.querySelector('.musicdata_score_title');
                
                // Check if this specific row contains the text "プレイ回数"
                if (titleElement && titleElement.innerText.includes('プレイ回数')) {
                    // If it does, find the score number within that same row
                    const countElement = row.querySelector('.musicdata_score_num .text_b');
                    if (countElement) {
                        playCount = countElement.innerText;
                    }
                    break; // Exit the loop since we've found the correct row
                }
            }
        }
        // --- END OF LOGIC ---

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
     * スコアに応じたランクと色を取得する
     * @param {number} score - スコア
     * @returns {Object} - ランク名と色のオブジェクト
     */
    const getRankInfo = (score) => {
        if (score >= 1009000) return { rank: "SSS+", color: "#FFD700" }; // Gold for SSS+
        if (score >= 1007500) return { rank: "SSS",  color: "#ffdf75" };
        if (score >= 1005000) return { rank: "SS+",  color: "#e88aff" }; // Purple for SS+
        if (score >= 1000000) return { rank: "SS",   color: "#e88aff" }; // Purple for SS
        if (score >= 975000)  return { rank: "S",    color: "#e88aff" }; // Purple for S
        if (score >= 950000)  return { rank: "AAA",  color: "#f44336" }; // Red for AAA/AA/A
        if (score >= 925000)  return { rank: "AA",   color: "#f44336" };
        if (score >= 900000)  return { rank: "A",    color: "#f44336" };
        if (score >= 800000)  return { rank: "BBB",  color: "#2196F3" }; // Blue for BBB/BB/B
        if (score >= 700000)  return { rank: "BB",   color: "#2196F3" };
        if (score >= 600000)  return { rank: "B",    color: "#2196F3" };
        if (score >= 500000)  return { rank: "C",    color: "#795548" }; // Brown for C
        return { rank: "D", color: "#9E9E9E" }; // Grey for D
    };

    
    /**
     * Canvas APIを使って画像を生成する
     */
    const generateImage = async (playerData, bestList, recentList) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const calculateAverageRating = (list) => {
            if (!list || list.length === 0) return 0.0;
            const total = list.reduce((sum, song) => sum + song.rating, 0);
            return total / list.length;
        };

        // --- レイアウト定数 ---
        const WIDTH = 1200, PADDING = 15, HEADER_HEIGHT = 160;
        const COLS = 5;
        const BLOCK_WIDTH = (WIDTH - PADDING * (COLS + 1)) / COLS;
        const JACKET_SIZE = BLOCK_WIDTH * 0.7;
        const BLOCK_HEIGHT = 290; // 新レイアウトに合わせて高さを調整
        
        const calcListHeight = (list) => {
            if (!list.length) return 0;
            const rows = Math.ceil(list.length / COLS);
            return 40 + (rows * (BLOCK_HEIGHT + PADDING));
        };

        canvas.width = WIDTH;
        canvas.height = HEADER_HEIGHT + calcListHeight(bestList) + calcListHeight(recentList);
        
        ctx.fillStyle = '#313131';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // --- ヘッダー描画 ---
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText(playerData.name, PADDING, 50);

        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`PLAYER RATING: ${playerData.rating}`, WIDTH - PADDING, 50);

        const bestAvg = calculateAverageRating(bestList);
        const recentAvg = calculateAverageRating(recentList);

        ctx.font = '20px sans-serif';
        ctx.fillStyle = '#C8C8C8';
        ctx.fillText(`BEST枠 平均: ${bestAvg.toFixed(4)}`, WIDTH - PADDING, 90);
        ctx.fillText(`新曲枠 平均: ${recentAvg.toFixed(4)}`, WIDTH - PADDING, 120);
        ctx.textAlign = 'left';

        const allSongs = [...bestList, ...recentList];
        const imagePromises = allSongs.map(song => new Promise(resolve => {
            if (!song.jacketUrl) { resolve({ ...song, image: null }); return; }
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve({ ...song, image: img });
            img.onerror = () => resolve({ ...song, image: null });
            img.src = song.jacketUrl.replace('http://', 'https://');
        }));
        const songsWithImages = await Promise.all(imagePromises);

        // --- 楽曲リスト描画関数 ---
        const renderSongList = (title, list, startY) => {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText(title, PADDING, startY + 25);
            
            list.forEach((song, i) => {
                const row = Math.floor(i / COLS);
                const col = i % COLS;
                const x = PADDING + col * (BLOCK_WIDTH + PADDING);
                const y = startY + 40 + row * (BLOCK_HEIGHT + PADDING);

                ctx.fillStyle = 'rgba(74, 74, 74, 0.8)';
                ctx.strokeStyle = '#555';
                ctx.lineWidth = 1;
                ctx.fillRect(x, y, BLOCK_WIDTH, BLOCK_HEIGHT);
                ctx.strokeRect(x, y, BLOCK_WIDTH, BLOCK_HEIGHT);

                const rankInfo = getRankInfo(song.score_int);
                
                const jacket_x = x + (BLOCK_WIDTH - JACKET_SIZE) / 2;
                const jacket_y = y + 15;
                if (song.image) {
                    ctx.drawImage(song.image, jacket_x, jacket_y, JACKET_SIZE, JACKET_SIZE);
                } else {
                    ctx.fillStyle = '#222';
                    ctx.fillRect(jacket_x, jacket_y, JACKET_SIZE, JACKET_SIZE);
                }

                // --- テキスト描画（新レイアウト）---
                let text_y = jacket_y + JACKET_SIZE + 25;

                // Line 1: 曲名（左揃え）とプレイ回数（右揃え）
                ctx.font = 'bold 16px sans-serif';
                let titleText = song.title;
                const availableWidth = BLOCK_WIDTH - 80; // 右側にスペースを確保
                
                // 文字幅を計算して省略記号(...)を追加
                if (ctx.measureText(titleText).width > availableWidth) {
                    while (ctx.measureText(titleText + '…').width > availableWidth) {
                        titleText = titleText.slice(0, -1);
                    }
                    titleText += '…';
                }
                
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'left';
                ctx.fillText(titleText, x + 10, text_y);

                ctx.fillStyle = '#81D4FA'; // 明るい青色
                ctx.font = '14px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(`▶ ${song.playCount}`, x + BLOCK_WIDTH - 10, text_y);
                ctx.textAlign = 'left';
                text_y += 28;

                // Line 2: スコア [ランク]
                ctx.fillStyle = rankInfo.color;
                ctx.font = 'bold 20px sans-serif';
                ctx.fillText(`${song.score_str} [${rankInfo.rank}]`, x + 10, text_y);
                text_y += 32;

                // Line 3 & 4: CONST と RATING
                ctx.fillStyle = '#E0E0E0';
                ctx.font = '15px sans-serif';
                ctx.fillText(`CONST:`, x + 10, text_y);
                ctx.fillText(song.const.toFixed(2), x + 90, text_y);
                text_y += 22;
                
                ctx.fillText(`RATING:`, x + 10, text_y);
                ctx.fillText(song.rating.toFixed(2), x + 90, text_y);
            });
        };
        
        const bestStartY = HEADER_HEIGHT;
        const recentStartY = bestStartY + calcListHeight(bestList);
        
        renderSongList("BEST枠", songsWithImages.slice(0, bestList.length), bestStartY);
        renderSongList("新曲枠", songsWithImages.slice(bestList.length), recentStartY);
        
        const dataUrl = canvas.toDataURL('image/png');
        const overlay = document.querySelector('div[style*="z-index: 9999"]');
        if (overlay) {
            overlay.innerHTML = ''; 
            overlay.style.alignItems = 'flex-start';
            overlay.style.overflowY = 'auto';

            const resultImage = document.createElement('img');
            resultImage.src = dataUrl;
            resultImage.style.maxWidth = '90%';
            resultImage.style.margin = '20px auto';
            resultImage.style.display = 'block';
            
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `position: fixed; top: 10px; right: 20px; z-index: 10001;`;

            const saveButton = document.createElement('button');
            saveButton.textContent = '画像を保存';
            saveButton.style.cssText = `padding: 10px 20px; font-size: 16px; cursor: pointer; background-color: #4CAF50; color: white; border: none; border-radius: 5px; margin-right: 10px;`;
            saveButton.onclick = () => {
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `chunithm-rating-${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            };

            const closeButton = document.createElement('button');
            closeButton.textContent = '閉じる';
            closeButton.style.cssText = `padding: 10px 20px; font-size: 16px; cursor: pointer; background-color: #f44336; color: white; border: none; border-radius: 5px;`;

            const closeOverlay = () => document.body.removeChild(overlay);
            closeButton.onclick = closeOverlay;
            
            buttonContainer.appendChild(saveButton);
            buttonContainer.appendChild(closeButton);

            overlay.appendChild(resultImage);
            overlay.appendChild(buttonContainer);
        }
    };

    // --- メイン処理 ---
    try {
        updateMessage("プレイヤー情報を取得中...");
        const playerDoc = await fetchDocument(URL_PLAYER_DATA);

        // --- RATING SCRAPING FIX START ---
        // 画像からレーティング数値を抽出する
        let ratingString = '';
        const ratingImages = playerDoc.querySelectorAll('.player_rating_num_block img');
        ratingImages.forEach(img => {
            const src = img.src;
            const lastChar = src.charAt(src.length - 5); // "num_X.png" の "X" を取得
            if (lastChar === 'a') {
                ratingString += '.';
            } else {
                ratingString += lastChar;
            }
        });
        // --- RATING SCRAPING FIX END ---

        const playerData = {
            name: playerDoc.querySelector('.player_name_in').innerText,
            rating: ratingString, // 修正したレーティング文字列を使用
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

            const difficultyMapToJson = {
                'MASTER': 'MAS', 'EXPERT': 'EXP', 'ULTIMA': 'ULT',
                'ADVANCED': 'ADV', 'BASIC': 'BAS'
            };
            const diffAbbreviation = difficultyMapToJson[song.difficulty];

            const matchedConst = constData.find(
                m => m.title === song.title && m.diff === diffAbbreviation
            )?.const;
            
            const rating = calculateRating(song.score_int, matchedConst);
            
            detailedSongs.push({ ...song, ...details, 'const': matchedConst || 0.0, rating });
        }
        
        const finalBestList = detailedSongs.slice(0, bestList.length);
        const finalRecentList = detailedSongs.slice(bestList.length);

        await generateImage(playerData, finalBestList, finalRecentList);

    } catch (error) {
        console.error("ブックマークレットの実行中にエラーが発生しました:", error);
        message.textContent = `エラー: ${error.message} (詳細はコンソールを確認してください)`;
        setTimeout(() => document.body.removeChild(overlay), 5000);
    }
})();