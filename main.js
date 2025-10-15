// main.js
(async function() {
    'use strict';

    // --- 設定項目 ---
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
        background: rgba(0, 0, 0, 0.85); z-index: 9999; display: flex;
        justify-content: center; align-items: center; color: white;
        font-family: sans-serif;
    `;
    document.body.appendChild(overlay);

    /**
     * ユーザーに画像生成モードを選択させるUIを表示する
     * @returns {Promise<string>} - 'vertical' または 'horizontal' を解決するPromise
     */
    const askForGenerationMode = () => {
        return new Promise(resolve => {
            const container = document.createElement('div');
            container.style.textAlign = 'center';

            const title = document.createElement('h2');
            title.textContent = '画像生成モードを選択してください';
            title.style.cssText = 'font-size: 24px; margin-bottom: 30px; font-weight: bold;';
            container.appendChild(title);

            const createButton = (text, mode) => {
                const button = document.createElement('button');
                button.textContent = text;
                button.style.cssText = `
                    display: inline-block; width: 200px; padding: 15px; margin: 0 15px;
                    font-size: 18px; font-weight: bold; cursor: pointer;
                    background-color: #4A90E2; color: white; border: none;
                    border-radius: 8px; transition: background-color 0.3s, transform 0.1s;
                `;
                button.onmouseover = () => button.style.backgroundColor = '#357ABD';
                button.onmouseout = () => button.style.backgroundColor = '#4A90E2';
                button.onmousedown = () => button.style.transform = 'scale(0.98)';
                button.onmouseup = () => button.style.transform = 'scale(1)';
                button.onclick = () => resolve(mode);
                return button;
            };

            container.appendChild(createButton('縦モード (従来)', 'vertical'));
            container.appendChild(createButton('横モード (並列)', 'horizontal'));
            overlay.appendChild(container);
        });
    };

    const message = document.createElement('p');
    message.style.fontSize = "20px";

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
                params: {
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

        let playCount = 'N/A';
        const difficultyMap = { '0': 'basic', '1': 'advanced', '2': 'expert', '3': 'master', '4': 'ultima' };
        const diffSelector = `.music_box.bg_${difficultyMap[params.diff]}`;
        const difficultyBlock = doc.querySelector(diffSelector);

        if (difficultyBlock) {
            const dataRows = difficultyBlock.querySelectorAll('.block_underline.ptb_5');
            for (const row of dataRows) {
                const titleElement = row.querySelector('.musicdata_score_title');
                if (titleElement && titleElement.innerText.includes('プレイ回数')) {
                    const countElement = row.querySelector('.musicdata_score_num .text_b');
                    if (countElement) {
                        playCount = countElement.innerText;
                    }
                    break;
                }
            }
        }
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
        if (score >= 1009000) return constant + 2.15;
        if (score >= 1007500) return constant + 2.0 + (score - 1007500) * 0.0001;
        if (score >= 1005000) return constant + 1.5 + (score - 1005000) * 0.0002;
        if (score >= 1000000) return constant + 1.0 + (score - 1000000) * 0.0001;
        if (score >= 975000)  return constant + (score - 975000) / 25000;
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
        if (score >= 1009000) return { rank: "SSS+", color: "#FFD700" };
        if (score >= 1007500) return { rank: "SSS",  color: "#ffdf75" };
        if (score >= 1005000) return { rank: "SS+",  color: "#e88aff" };
        if (score >= 1000000) return { rank: "SS",   color: "#e88aff" };
        if (score >= 975000)  return { rank: "S",    color: "#e88aff" };
        if (score >= 950000)  return { rank: "AAA",  color: "#f44336" };
        if (score >= 925000)  return { rank: "AA",   color: "#f44336" };
        if (score >= 900000)  return { rank: "A",    color: "#f44336" };
        if (score >= 800000)  return { rank: "BBB",  color: "#2196F3" };
        if (score >= 700000)  return { rank: "BB",   color: "#2196F3" };
        if (score >= 600000)  return { rank: "B",    color: "#2196F3" };
        if (score >= 500000)  return { rank: "C",    color: "#795548" };
        return { rank: "D", color: "#9E9E9E" };
    };

    /**
     * 角丸の四角形を描画するヘルパー関数
     */
    const drawRoundRect = (ctx, x, y, width, height, radius) => {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    };

    /**
     * Canvas APIを使って画像を生成する
     */
    const generateImage = async (playerData, bestList, recentList, mode) => {
        await document.fonts.load('bold 20px "Noto Sans JP"');
        await document.fonts.load('20px "Noto Sans JP"');

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const wrapText = (context, text, x, y, maxWidth, lineHeight, align = 'left', maxLines = Infinity) => {
            const words = text.split('');
            let line = '';
            let currentY = y;
            let lineCount = 1;

            const drawLine = (line, y) => {
                let drawX = x;
                if (align === 'center') {
                    const lineWidth = context.measureText(line).width;
                    drawX = x + (maxWidth - lineWidth) / 2;
                }
                context.fillText(line, drawX, y);
            };

            for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n];
                const metrics = context.measureText(testLine);
                const testWidth = metrics.width;
                if (testWidth > maxWidth && n > 0) {
                    if (lineCount >= maxLines) {
                        let truncatedLine = line;
                        while (context.measureText(truncatedLine + '…').width > maxWidth) {
                            truncatedLine = truncatedLine.slice(0, -1);
                        }
                        drawLine(truncatedLine + '…', currentY);
                        return { finalY: currentY, lines: lineCount };
                    }
                    drawLine(line, currentY);
                    line = words[n];
                    currentY += lineHeight;
                    lineCount++;
                } else {
                    line = testLine;
                }
            }
            drawLine(line, currentY);
            return { finalY: currentY, lines: lineCount };
        };

        const calculateAverageRating = (list) => {
            if (!list || list.length === 0) return 0.0;
            const total = list.reduce((sum, song) => sum + song.rating, 0);
            return total / list.length;
        };

        // --- レイアウト定数 ---
        let WIDTH, COLS, BLOCK_WIDTH;
        const PADDING = 25;
        const HEADER_HEIGHT = 200;
        const BLOCK_HEIGHT = 400;
        const FONT_FAMILY = '"Noto Sans JP", sans-serif';

        if (mode === 'vertical') {
            WIDTH = 1920;
            COLS = 8;
            BLOCK_WIDTH = (WIDTH - PADDING * (COLS + 1)) / COLS;
        } else { // horizontal
            COLS = 6;
            BLOCK_WIDTH = 210;
            const CENTER_GAP = 75; // ★ BESTとRECENTの間のスペース
            const gridWidth = (BLOCK_WIDTH * COLS) + (PADDING * (COLS - 1));
            WIDTH = PADDING + gridWidth + CENTER_GAP + gridWidth + PADDING;
        }
        const JACKET_SIZE = BLOCK_WIDTH * 0.85;

        const calcListHeight = (list, cols) => {
            if (!list.length) return 0;
            const rows = Math.ceil(list.length / cols);
            return 50 + (rows * (BLOCK_HEIGHT + PADDING)); // 50 for title
        };
        
        canvas.width = WIDTH;
        if (mode === 'vertical') {
            canvas.height = HEADER_HEIGHT + calcListHeight(bestList, COLS) + calcListHeight(recentList, COLS) + PADDING;
        } else {
            canvas.height = HEADER_HEIGHT + Math.max(calcListHeight(bestList, COLS), calcListHeight(recentList, COLS)) + PADDING;
        }

        // --- 背景描画 ---
        const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGradient.addColorStop(0, '#1a1a1a');
        bgGradient.addColorStop(1, '#000000');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // --- ヘッダー描画 ---
        ctx.font = `bold 48px ${FONT_FAMILY}`;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 15;
        ctx.fillText(playerData.name, PADDING, 75);
        ctx.shadowBlur = 0;

        const now = new Date();
        const timestamp = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        ctx.font = `16px ${FONT_FAMILY}`;
        ctx.fillStyle = '#D1C4E9';
        ctx.fillText(`Generated at: ${timestamp}`, PADDING, 110);

        ctx.textAlign = 'right';
        ctx.font = `bold 28px ${FONT_FAMILY}`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`PLAYER RATING`, WIDTH - PADDING, 65);
        ctx.font = `bold 52px ${FONT_FAMILY}`;
        ctx.fillStyle = '#00FFFF';
        ctx.shadowColor = 'rgba(0, 255, 255, 0.9)';
        ctx.shadowBlur = 20;
        ctx.fillText(playerData.rating, WIDTH - PADDING, 115);
        ctx.shadowBlur = 0;

        const bestAvg = calculateAverageRating(bestList);
        const recentAvg = calculateAverageRating(recentList);
        ctx.font = `20px ${FONT_FAMILY}`;
        ctx.fillStyle = '#D1C4E9';
        ctx.fillText(`BEST Avg: ${bestAvg.toFixed(4)}`, WIDTH - PADDING, 150);
        ctx.fillText(`RECENT Avg: ${recentAvg.toFixed(4)}`, WIDTH - PADDING, 180);
        ctx.textAlign = 'left';
        
        // --- ★★★ (横モードのみ) 境界線を描画 ★★★ ---
        if (mode === 'horizontal') {
            const gridWidth = (BLOCK_WIDTH * COLS) + (PADDING * (COLS - 1));
            const CENTER_GAP = 75;
            const lineX = PADDING + gridWidth + (CENTER_GAP / 2);
            
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 2;
            ctx.setLineDash([10, 10]); // 点線
            ctx.beginPath();
            ctx.moveTo(lineX, HEADER_HEIGHT + 15);
            ctx.lineTo(lineX, canvas.height - PADDING - 30);
            ctx.stroke();
            ctx.restore();
        }

        // --- 画像の事前読み込み ---
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
        const renderSongList = (title, list, startX, startY, cols, blockWidth) => {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `bold 24px ${FONT_FAMILY}`;
            ctx.fillText(title, startX, startY + 30);

            list.forEach((song, i) => {
                const row = Math.floor(i / cols);
                const col = i % cols;
                const x = startX + col * (blockWidth + PADDING);
                const y = startY + 50 + row * (BLOCK_HEIGHT + PADDING);

                // カード背景
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 1;
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 15;
                ctx.shadowOffsetX = 5;
                ctx.shadowOffsetY = 5;
                drawRoundRect(ctx, x, y, blockWidth, BLOCK_HEIGHT, 15);
                ctx.fill();
                ctx.stroke();
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                // ジャケット
                const jacket_x = x + (blockWidth - JACKET_SIZE) / 2;
                const jacket_y = y + 20;
                if (song.image) {
                    ctx.save();
                    drawRoundRect(ctx, jacket_x, jacket_y, JACKET_SIZE, JACKET_SIZE, 10);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.clip();
                    ctx.drawImage(song.image, jacket_x, jacket_y, JACKET_SIZE, JACKET_SIZE);
                    ctx.restore();
                } else {
                    ctx.fillStyle = '#222';
                    drawRoundRect(ctx, jacket_x, jacket_y, JACKET_SIZE, JACKET_SIZE, 10);
                    ctx.fill();
                }
                
                // ジャケット右上の番号と難易度帯
                const numberText = `#${i + 1}`;
                ctx.font = `bold 30px ${FONT_FAMILY}`;
                const textMetrics = ctx.measureText(numberText);
                const textWidth = textMetrics.width;
                const ribbonHeight = 38;
                const ribbonWidth = textWidth + 20;
                const ribbonX = jacket_x + JACKET_SIZE - ribbonWidth - 5;
                const ribbonY = jacket_y + 5;
                const difficultyInfo = {
                    ULTIMA: { bg: 'linear-gradient(135deg, #a00, #310000)' },
                    MASTER: { bg: '#8A2BE2' }, EXPERT: { bg: '#FF4500' },
                    ADVANCED: { bg: '#FDD835' }, BASIC: { bg: '#7CB342' },
                    UNKNOWN: { bg: '#9E9E9E' }
                };
                const diffStyle = difficultyInfo[song.difficulty] || difficultyInfo.UNKNOWN;
                ctx.save();
                if (song.difficulty === 'ULTIMA') {
                    const grad = ctx.createLinearGradient(ribbonX, ribbonY, ribbonX + ribbonWidth, ribbonY);
                    grad.addColorStop(0, '#a00'); grad.addColorStop(1, '#1a1a1a');
                    ctx.fillStyle = grad;
                } else { ctx.fillStyle = diffStyle.bg; }
                drawRoundRect(ctx, ribbonX, ribbonY, ribbonWidth, ribbonHeight, 8);
                ctx.fill();
                ctx.restore();
                
                ctx.textAlign = 'right';
                ctx.lineJoin = 'round';
                const numberX = ribbonX + ribbonWidth - 10;
                const numberY = ribbonY + ribbonHeight - 8;
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.lineWidth = 6;
                ctx.strokeText(numberText, numberX, numberY);
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(numberText, numberX, numberY);
                ctx.textAlign = 'left';
                ctx.lineWidth = 1;

                // テキスト描画
                let current_y = jacket_y + JACKET_SIZE + 30;
                const text_x_padded = x + 15;
                const text_width = blockWidth - 30;
                const titleLineHeight = 22;
                ctx.fillStyle = '#FFFFFF';
                ctx.font = `bold 17px ${FONT_FAMILY}`;
                const titleInfo = wrapText(ctx, song.title, text_x_padded, current_y, text_width, titleLineHeight, 'center', 2);
                current_y = titleInfo.finalY + (titleInfo.lines === 1 ? titleLineHeight : 0);
                current_y += 28;

                // スコアとランク
                const rankInfo = getRankInfo(song.score_int);
                const scoreText = song.score_str;
                const rankText = `[${rankInfo.rank}]`;
                const gap = 8;
                ctx.font = `bold 24px ${FONT_FAMILY}`;
                const scoreWidth = ctx.measureText(scoreText).width;
                ctx.font = `bold 16px ${FONT_FAMILY}`;
                const rankWidth = ctx.measureText(rankText).width;
                const totalWidth = scoreWidth + gap + rankWidth;
                const score_x = x + (blockWidth - totalWidth) / 2;
                if (rankInfo.rank === "SSS+" || rankInfo.rank === "SSS") {
                    ctx.shadowColor = rankInfo.color;
                    ctx.shadowBlur = 10;
                }
                ctx.font = `bold 24px ${FONT_FAMILY}`;
                ctx.fillStyle = rankInfo.color;
                ctx.fillText(scoreText, score_x, current_y);
                ctx.font = `bold 16px ${FONT_FAMILY}`;
                ctx.fillText(rankText, score_x + scoreWidth + gap, current_y);
                ctx.shadowBlur = 0;
                current_y += 38;

                // データ行
                const drawDataRow = (label, value, y_pos, valueColor = '#FFFFFF', valueFont = `bold 18px ${FONT_FAMILY}`) => {
                    ctx.font = `16px ${FONT_FAMILY}`;
                    ctx.fillStyle = '#B0A5C8';
                    ctx.fillText(label, text_x_padded, y_pos);
                    ctx.textAlign = 'right';
                    ctx.font = valueFont;
                    ctx.fillStyle = valueColor;
                    ctx.fillText(value, x + blockWidth - 15, y_pos);
                    ctx.textAlign = 'left';
                };
                drawDataRow('定数', song.const.toFixed(2), current_y);
                current_y += 30;
                drawDataRow('プレイ回数', song.playCount, current_y);
                current_y += 32;
                drawDataRow('RATE', song.rating.toFixed(4), current_y, '#81D4FA', `bold 22px ${FONT_FAMILY}`);
            });
        };

        if (mode === 'vertical') {
            const bestStartY = HEADER_HEIGHT;
            const recentStartY = bestStartY + calcListHeight(bestList, COLS);
            renderSongList("BEST", songsWithImages.slice(0, bestList.length), PADDING, bestStartY, COLS, BLOCK_WIDTH);
            renderSongList("RECENT", songsWithImages.slice(bestList.length), PADDING, recentStartY, COLS, BLOCK_WIDTH);
        } else { // horizontal
            const listsStartY = HEADER_HEIGHT;
            const bestStartX = PADDING;
            const CENTER_GAP = 75; // ★ BESTとRECENTの間のスペース
            const gridWidth = (BLOCK_WIDTH * COLS) + (PADDING * (COLS - 1));
            const recentStartX = PADDING + gridWidth + CENTER_GAP; // ★ RECENTの開始位置を調整
            renderSongList("BEST", songsWithImages.slice(0, bestList.length), bestStartX, listsStartY, COLS, BLOCK_WIDTH);
            renderSongList("RECENT", songsWithImages.slice(bestList.length), recentStartX, listsStartY, COLS, BLOCK_WIDTH);
        }
        
        // --- フッター ---
        ctx.font = `14px ${FONT_FAMILY}`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.textAlign = 'center';
        ctx.fillText('Generated by CHUNITHM Rating Image Generator', canvas.width / 2, canvas.height - 15);

        // --- 結果表示 ---
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const overlay = document.querySelector('div[style*="z-index: 9999"]');
        if (overlay) {
            overlay.innerHTML = '';
            overlay.style.alignItems = 'flex-start';
            overlay.style.overflowY = 'auto';

            const resultImage = document.createElement('img');
            resultImage.src = dataUrl;
            resultImage.style.cssText = 'max-width: 90%; margin: 20px auto; display: block; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);';

            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = 'position: fixed; top: 10px; right: 20px; z-index: 10001;';

            const saveButton = document.createElement('button');
            saveButton.textContent = '画像を保存';
            saveButton.style.cssText = 'padding: 10px 20px; font-size: 16px; cursor: pointer; background-color: #4CAF50; color: white; border: none; border-radius: 5px; margin-right: 10px;';
            saveButton.onclick = () => {
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `chunithm-rating-${Date.now()}.png`;
                a.click();
            };

            const closeButton = document.createElement('button');
            closeButton.textContent = '閉じる';
            closeButton.style.cssText = 'padding: 10px 20px; font-size: 16px; cursor: pointer; background-color: #f44336; color: white; border: none; border-radius: 5px;';
            closeButton.onclick = () => document.body.removeChild(overlay);

            buttonContainer.appendChild(saveButton);
            buttonContainer.appendChild(closeButton);
            overlay.appendChild(resultImage);
            overlay.appendChild(buttonContainer);
        }
    };
    
    // --- メイン処理 ---
    try {
        const mode = await askForGenerationMode();
        
        overlay.innerHTML = ''; // 選択UIを消去
        overlay.appendChild(message);

        updateMessage("プレイヤー情報を取得中...");
        const playerDoc = await fetchDocument(URL_PLAYER_DATA);

        let ratingString = '';
        const ratingImages = playerDoc.querySelectorAll('.player_rating_num_block img');
        ratingImages.forEach(img => {
            const src = img.src;
            const lastChar = src.charAt(src.length - 5);
            ratingString += (lastChar === 'a') ? '.' : lastChar;
        });

        const playerData = {
            name: playerDoc.querySelector('.player_name_in').innerText,
            rating: ratingString,
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

            const difficultyMapToJson = { 'MASTER': 'MAS', 'EXPERT': 'EXP', 'ULTIMA': 'ULT', 'ADVANCED': 'ADV', 'BASIC': 'BAS' };
            const diffAbbreviation = difficultyMapToJson[song.difficulty];
            const matchedConst = constData.find(m => m.title === song.title && m.diff === diffAbbreviation)?.const;
            const rating = calculateRating(song.score_int, matchedConst);
            
            detailedSongs.push({ ...song, ...details, 'const': matchedConst || 0.0, rating });
        }
        
        const finalBestList = detailedSongs.slice(0, bestList.length);
        const finalRecentList = detailedSongs.slice(bestList.length);

        await generateImage(playerData, finalBestList, finalRecentList, mode);

    } catch (error) {
        console.error("ブックマークレットの実行中にエラーが発生しました:", error);
        message.textContent = `エラー: ${error.message} (詳細はコンソールを確認してください)`;
        setTimeout(() => document.body.removeChild(overlay), 5000);
    }
})();