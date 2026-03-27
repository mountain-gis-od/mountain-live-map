    function toggleMenu() { document.getElementById('ui-panel').classList.toggle('show'); }
    function toggleLegend() { document.getElementById('legend-panel').classList.toggle('show'); }

    const urlParams = new URLSearchParams(window.location.search);
    const startLat = parseFloat(urlParams.get('lat')) || 36.3992; 
    const startLng = parseFloat(urlParams.get('lng')) || 137.7152; 
    const startZoom = parseInt(urlParams.get('zoom')) || 18; 
    const startTheme = urlParams.get('theme'); // ★追加: URLからthemeパラメータを取得

    // ★追加: 取得したテーマがプルダウンの選択肢に存在すればセットする
    if (startTheme) {
        const themeSelect = document.getElementById('map-theme');
        if (Array.from(themeSelect.options).some(opt => opt.value === startTheme)) {
            themeSelect.value = startTheme;
        }
    }

    // 取得した座標を中心にマップ描画
    const map = L.map('map', { maxZoom: 22, zoomControl: false }).setView([startLat, startLng], startZoom);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', { maxNativeZoom: 18, maxZoom: 22 }).addTo(map);

    map.createPane('gridPane');
    map.getPane('gridPane').style.zIndex = 400; 
    map.getPane('gridPane').style.opacity = 0.6; 

    let currentLayer = null;
    let allFeatures = [];

    function getProp(props, targetKey) {
        targetKey = targetKey.toLowerCase();
        for (let key in props) {
            if (key.toLowerCase() === targetKey) return props[key];
        }
        return undefined;
    }

    const dataSources = [
        { url: 'data/signal_track.geojson', type: 'outdoor' },
        { url: 'data/indoor_survey.geojson', type: 'indoor' },
        { url: 'data/flower_survey.geojson', type: 'flower' }, 
        { url: 'data/autumn_survey.geojson', type: 'autumn' }
    ];

    Promise.all(dataSources.map(source => 
        fetch(source.url + '?t=' + new Date().getTime()).then(res => res.json()).then(data => {
            data.features.forEach(f => f.properties.surveyType = source.type);
            return data.features;
        }).catch(err => [])
    )).then(results => {
        allFeatures = results.flat(); 
        updateUIAndFilters(); 
    });

    function getThemeColor(props, surveyType) {
        const status = getProp(props, 'status') || '';
        if (surveyType === 'flower') {
            if (status.includes('つぼみ')) return '#32CD32'; 
            if (status.includes('咲き始め')) return '#FFB6C1'; 
            if (status.includes('見頃') || status.includes('満開')) return '#FF1493'; 
            if (status.includes('散り始め')) return '#FFA500'; 
            if (status.includes('終了') || status.includes('葉桜')) return '#8B4513'; 
            return '#FF69B4'; 
        }
        else if (surveyType === 'autumn') {
            if (status.includes('青葉') || status.includes('緑')) return '#228B22'; 
            if (status.includes('色づき') || status.includes('黄色')) return '#FFA500'; 
            if (status.includes('見頃') || status.includes('紅葉')) return '#DC143C'; 
            if (status.includes('枯れ') || status.includes('落葉')) return '#8B4513'; 
            return '#FF4500'; 
        }
        else {
            const rawLevel = String(getProp(props, 'signallevel') || '');
            if (rawLevel.includes('衛星') || rawLevel.toLowerCase().includes('starlink')) return '#1E90FF';
            const level = parseInt(rawLevel, 10); 
            if (level === 4) return '#00FF00'; 
            if (level === 3) return '#FFFF00';
            if (level === 2) return '#FFA500'; 
            if (level === 1) return '#FF0000';
            return '#808080';
        }
    }

    function isStale(dateStr) {
        if (!dateStr) return false;
        const obsDate = new Date(dateStr);
        if (isNaN(obsDate)) return false;
        const today = new Date();
        const diffDays = (today - obsDate) / (1000 * 60 * 60 * 24);
        return diffDays >= 7; 
    }

    function updateLegend(mapTheme) {
        const panel = document.getElementById('legend-panel');
        let html = '';
        
        if (mapTheme === 'indoor' || mapTheme === 'outdoor' || mapTheme === 'ALL') {
            html += `<div class="legend-title">📶 電波強度</div>
                <div class="legend-item"><div class="color-box" style="background:#00FF00;"></div>4 (非常に良好)</div>
                <div class="legend-item"><div class="color-box" style="background:#FFFF00;"></div>3 (良好)</div>
                <div class="legend-item"><div class="color-box" style="background:#FFA500;"></div>2 (やや弱い)</div>
                <div class="legend-item"><div class="color-box" style="background:#FF0000;"></div>1 (非常に弱い)</div>
                <div class="legend-item"><div class="color-box" style="background:#808080;"></div>0 (圏外・測定不可)</div>
                <div class="legend-item"><div class="color-box" style="background:#1E90FF;"></div>衛星 (Starlink等)</div>`;
        }
        
        if (mapTheme === 'flower' || mapTheme === 'ALL') {
            if (mapTheme === 'ALL') html += `<div style="margin:12px 0; border-top:1px solid #ccc;"></div>`;
            html += `<div class="legend-title">🌸 開花状況</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#32CD32;"></div>つぼみ</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#FFB6C1;"></div>咲き始め</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#FF1493;"></div>見頃・満開</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#FFA500;"></div>散り始め</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#8B4513;"></div>終了・葉桜</div>`;
        }
        
        if (mapTheme === 'autumn' || mapTheme === 'ALL') {
            if (mapTheme === 'ALL') html += `<div style="margin:12px 0; border-top:1px solid #ccc;"></div>`;
            html += `<div class="legend-title">🍁 紅葉状況</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#228B22;"></div>青葉・緑葉</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#FFA500;"></div>色づき始め</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#DC143C;"></div>見頃・紅葉</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#8B4513;"></div>枯れ・落葉</div>`;
        }
        
        panel.innerHTML = html;
    }

    function populateSpeciesDropdown(theme) {
        const select = document.getElementById('filter-species');
        select.innerHTML = '<option value="ALL">すべての種類</option>';
        const speciesSet = new Set();
        allFeatures.forEach(f => {
            if (f.properties.surveyType === theme) {
                const name = getProp(f.properties, 'name');
                if (name) speciesSet.add(name);
            }
        });
        Array.from(speciesSet).sort().forEach(species => {
            const option = document.createElement('option');
            option.value = species; option.textContent = species; select.appendChild(option);
        });
    }

    function populateFloorDropdown() {
        const select = document.getElementById('filter-floor');
        select.innerHTML = '<option value="ALL">すべての階層</option>';
        
        const floorSet = new Set();
        
        allFeatures.forEach(f => {
            if (f.properties.surveyType === 'indoor') {
                const floor = getProp(f.properties, 'floor') || getProp(f.properties, '階層');
                if (floor) floorSet.add(floor);
            }
        });

        Array.from(floorSet).sort().forEach(floor => {
            const option = document.createElement('option');
            option.value = floor; 
            option.textContent = floor; 
            select.appendChild(option);
        });
    }
    
    function updateUIAndFilters() {
        const mapTheme = document.getElementById('map-theme').value;
        const rfGroup = document.getElementById('filter-rf-group');
        const natureGroup = document.getElementById('filter-nature-group');
        const weatherGroup = document.getElementById('filter-weather-group');
        const windDirGroup = document.getElementById('filter-wind-dir-group'); 
        const windStrGroup = document.getElementById('filter-wind-str-group'); 
        const floorGroup = document.getElementById('filter-floor-group');

        if (mapTheme === 'flower' || mapTheme === 'autumn') {
            rfGroup.style.display = 'none'; natureGroup.style.display = 'block';
            populateSpeciesDropdown(mapTheme);
        } else {
            rfGroup.style.display = 'block'; natureGroup.style.display = 'none';
            if (mapTheme === 'indoor') {
                weatherGroup.style.display = 'none'; 
                windDirGroup.style.display = 'none'; 
                windStrGroup.style.display = 'none'; 
                floorGroup.style.display = 'block';
                populateFloorDropdown();
            } else if (mapTheme === 'outdoor') {
                weatherGroup.style.display = 'block'; 
                windDirGroup.style.display = 'block'; 
                windStrGroup.style.display = 'block'; 
                floorGroup.style.display = 'none';
            } else { 
                weatherGroup.style.display = 'block'; 
                windDirGroup.style.display = 'block'; 
                windStrGroup.style.display = 'block'; 
                floorGroup.style.display = 'none'; 
            }
        }
        applyFilters();
    }

    function applyFilters() {
        const mapTheme = document.getElementById('map-theme').value;
        const selectedCarrier = document.getElementById('filter-carrier').value;
        const selectedWeather = document.getElementById('filter-weather').value;
        const windStrSelect = document.getElementById('filter-wind-str');
        const windDirSelect = document.getElementById('filter-wind-dir');
        
        if (windStrSelect.value === '無風') {
            windDirSelect.value = 'ALL'; // 自動的に「すべて表示」に戻す
            windDirSelect.disabled = true; // 選択不可（グレーアウト）にする
        } else {
            windDirSelect.disabled = false; // 選択可能にする
        }
        
        const selectedWindStr = windStrSelect.value; 
        const selectedWindDir = windDirSelect.value;
        
        const selectedSpecies = document.getElementById('filter-species').value;
        const selectedFloor = document.getElementById('filter-floor').value;

        updateLegend(mapTheme);

        const GROUPING_RADIUS_M = 15;
        const groupedNatureFeatures = []; 
        const otherFeatures = [];

        allFeatures.forEach(f => {
            const props = f.properties;
            const surveyType = props.surveyType;
            
            if (surveyType === 'flower' || surveyType === 'autumn') {
                const name = getProp(props, 'name') || '不明';
                const dateStr = getProp(props, 'date');
                const currentDate = dateStr ? new Date(dateStr) : new Date(0);
                
                const latlng = L.latLng(f.geometry.coordinates[1], f.geometry.coordinates[0]);

                let foundGroup = false;
                for (let g of groupedNatureFeatures) {
                    if (g.surveyType === surveyType) {
                        const rawName = getProp(props, 'name');
                        if (rawName && rawName !== g.name) continue;

                        const dist = latlng.distanceTo(g.latlng);
                        if (dist <= GROUPING_RADIUS_M) { 
                            foundGroup = true;
                            if (currentDate >= g.date) {
                                f.properties.name = g.name;
                                f.properties.radius_m = g.radius_m;
                                
                                g.feature = f;
                                g.date = currentDate;
                                g.latlng = latlng; 
                            }
                            break;
                        }
                    }
                }
                
                if (!foundGroup) {
                    groupedNatureFeatures.push({
                        surveyType: surveyType,
                        name: name,
                        radius_m: getProp(props, 'radius_m'),
                        date: currentDate,
                        latlng: latlng,
                        feature: f
                    });
                }
            } else {
                otherFeatures.push(f);
            }
        });

        const combinedFeatures = [...groupedNatureFeatures.map(g => g.feature), ...otherFeatures];

        const filteredFeatures = combinedFeatures.filter(feature => {
            const props = feature.properties;
            const surveyType = props.surveyType;
            if (mapTheme !== "ALL" && surveyType !== mapTheme) return false;
            
            if (surveyType === 'indoor' || surveyType === 'outdoor') {
                const carrier = getProp(props, 'carrier');
                if (selectedCarrier !== "ALL" && carrier !== selectedCarrier) return false;
                
                if (surveyType === 'outdoor') {
                    
                    if (selectedWeather !== "ALL") {
                        const weather = getProp(props, 'weather') || '';
                        if (weather !== selectedWeather && !weather.includes(selectedWeather)) return false;
                    }
                    
                    if (selectedWindDir !== "ALL") {
                        const windDir = getProp(props, 'winddirection') || getProp(props, '風向') || '';
                        if (windDir !== selectedWindDir) return false;
                    }
                    
                    if (selectedWindStr !== "ALL") {
                        const windStr = getProp(props, 'windstrength') || getProp(props, '風力') || '';
                        if (windStr !== selectedWindStr) return false;
                    }
                }
                
                if (surveyType === 'indoor' && selectedFloor !== "ALL") { 
                    const floor = getProp(props, 'floor') || getProp(props, '階層') || '';
                    if (floor !== selectedFloor) return false; 
                }
            }
            if (surveyType === 'flower' || surveyType === 'autumn') {
                const name = getProp(props, 'name');
                if (selectedSpecies !== "ALL" && name !== selectedSpecies) return false;
            }
            return true;
        });

        const finalFeatures = [];
        const rfGroups = {};

        filteredFeatures.forEach(feature => {
            const props = feature.properties;
            const surveyType = props.surveyType;

            if (surveyType === 'indoor' || surveyType === 'outdoor') {
                // Point(既存の屋内データなど)とPolygon(新しい屋外データ)の両方の座標に対応
                let key = null;
                if (feature.geometry.type === 'Polygon') {
                    const c = feature.geometry.coordinates[0][0]; // [lon, lat]
                    key = `${c[0].toFixed(6)}_${c[1].toFixed(6)}`;
                } else if (feature.geometry.type === 'Point') {
                    const lon = feature.geometry.coordinates[0];
                    const lat = feature.geometry.coordinates[1];
                    const grid = 0.00003;
                    const epsilon = 1e-9;
                    const snapLat = Math.floor((lat / grid) + epsilon) * grid;
                    const snapLng = Math.floor((lon / grid) + epsilon) * grid;
                    key = `${snapLng.toFixed(6)}_${snapLat.toFixed(6)}`;
                }

                if (key) {
                    // 座標キーごとにデータをまとめる
                    if (!rfGroups[key]) {
                        rfGroups[key] = { baseFeature: feature, levels: [], weathers: new Set(), windDirs: new Set(), windStrs: new Set() };
                    }
                    const level = parseInt(getProp(props, 'signallevel'), 10);
                    if (!isNaN(level)) rfGroups[key].levels.push(level);
                    
                    const w = getProp(props, 'weather') || getProp(props, '天気');
                    if (w) rfGroups[key].weathers.add(w);
                    const wd = getProp(props, 'winddirection') || getProp(props, '風向');
                    if (wd) rfGroups[key].windDirs.add(wd);
                    const ws = getProp(props, 'windstrength') || getProp(props, '風力');
                    if (ws) rfGroups[key].windStrs.add(ws);
                } else {
                    finalFeatures.push(feature);
                }
            } else {
                finalFeatures.push(feature); // 植物系のデータはそのまま追加
            }
        });

        // まとめたデータから中央値を計算し、新しいFeatureを作成
        Object.values(rfGroups).forEach(group => {
            const clonedFeature = JSON.parse(JSON.stringify(group.baseFeature)); // ディープコピー
            if (group.levels.length > 0) {
                // 中央値の計算
                group.levels.sort((a, b) => a - b);
                const mid = Math.floor(group.levels.length / 2);
                const median = group.levels.length % 2 === 0 
                    ? Math.round((group.levels[mid - 1] + group.levels[mid]) / 2) 
                    : group.levels[mid];
                
                // プロパティの更新 (大文字小文字の重複を防ぐため一度削除)
                Object.keys(clonedFeature.properties).forEach(k => {
                    const lowerK = k.toLowerCase();
                    if (['signallevel', 'weather', 'winddirection', 'windstrength'].includes(lowerK)) {
                        delete clonedFeature.properties[k];
                    }
                });
                
                clonedFeature.properties.SignalLevel = median;
                // 重なった条件をカンマ区切りで結合 (例: "快晴, 曇り")
                clonedFeature.properties.Weather = Array.from(group.weathers).filter(Boolean).join(', ') || '不明';
                clonedFeature.properties.WindDirection = Array.from(group.windDirs).filter(Boolean).join(', ');
                clonedFeature.properties.WindStrength = Array.from(group.windStrs).filter(Boolean).join(', ');
                clonedFeature.properties.isMerged = group.levels.length > 1; // 複数マージされたかどうかのフラグ
            }
            finalFeatures.push(clonedFeature);
        });

        if (currentLayer) map.removeLayer(currentLayer);

        currentLayer = L.geoJSON({
            "type": "FeatureCollection",
            "features": finalFeatures
        }, {
            style: function (feature) {
                if (feature.geometry.type !== 'Point') {
                    return {
                        stroke: false, 
                        fillColor: getThemeColor(feature.properties, feature.properties.surveyType), 
                        fillOpacity: 1.0, 
                        pane: 'gridPane' 
                    };
                }
            },
            pointToLayer: function (feature, latlng) {
                const props = feature.properties;
                const surveyType = props.surveyType;
                const bgColor = getThemeColor(props, surveyType); 
                
                if (surveyType === 'flower' || surveyType === 'autumn') {
                    const isOld = isStale(getProp(props, 'date'));
                    const opacity = isOld ? 0.3 : 0.9;

                    const radiusMeters = parseFloat(getProp(props, 'radius_m'));
                    if (!isNaN(radiusMeters) && radiusMeters > 0) {
                        return L.circle(latlng, { radius: radiusMeters, color: '#fff', weight: 1, fillColor: bgColor, fillOpacity: opacity, opacity: opacity });
                    } else {
                        return L.circleMarker(latlng, { radius: 8, color: '#fff', weight: 1, fillColor: bgColor, fillOpacity: opacity, opacity: opacity });
                    }
                } else {
                    const grid = 0.00003; 
                    const epsilon = 1e-9;
                    const snapLat = Math.floor((latlng.lat / grid) + epsilon) * grid;
                    const snapLng = Math.floor((latlng.lng / grid) + epsilon) * grid;
                    
                    const bounds = [[snapLat, snapLng], [snapLat + grid, snapLng + grid]];
                    return L.rectangle(bounds, { color: '#555', weight: 0.5, fillColor: bgColor, fillOpacity: 1.0, pane: 'gridPane' });
                }
            },
            onEachFeature: function (feature, layer) {
                const props = feature.properties;
                const surveyType = props.surveyType;
                let popupContent = `<div style="font-size: 13px;">`;
                
                if ((surveyType === 'flower' || surveyType === 'autumn') && isStale(getProp(props, 'date'))) {
                    popupContent += `<div style="color:red; font-weight:bold; font-size:12px; margin-bottom:5px;">⚠️ 1週間以上前の情報です</div>`;
                }

                const photoUrl = getProp(props, 'photo');
                if (photoUrl && photoUrl.startsWith('http')) {
                    popupContent += `<div onclick="openModal('${photoUrl}')" class="popup-img-box" style="background-image: url('${photoUrl}');"></div>`;
                }
                
                if (surveyType === 'flower' || surveyType === 'autumn') {
                    const title = surveyType === 'flower' ? '🌸 開花状況' : '🍁 紅葉状況';
                    popupContent += `<b>${title}</b><hr>`;
                    popupContent += `<b>種類:</b> ${getProp(props, 'name') || '不明'}<br>`;
                    popupContent += `<b>状況:</b> <span style="font-size:15px; font-weight:bold;">${getProp(props, 'status') || '不明'}</span><br>`;
                    popupContent += `<b>確認日:</b> ${getProp(props, 'date') || '-'}<br>`;
                    
                    const memo = getProp(props, 'memo');
                    if(memo) popupContent += `<br><b>📝 メモ:</b><br><span style="color:#555;">${memo}</span>`;
                } 
                else {
                    popupContent += `<b>📡 キャリア:</b> ${getProp(props, 'carrier') || '不明'}<br>`;
                    popupContent += `<b>📶 電波強度:</b> ${getProp(props, 'signallevel') || '-'}<br>`;
                    
                    if (surveyType === 'outdoor') {
                        const weather = getProp(props, 'weather') || getProp(props, '天気') || '不明';
                        const windDir = getProp(props, 'winddirection') || getProp(props, '風向') || '';
                        const windStr = getProp(props, 'windstrength') || getProp(props, '風力') || '';
                        const windDisplay = windDir ? `${windDir} / ${windStr}` : '-';
                        
                        if (props.isMerged) {
                            popupContent += `<div style="color:#e67e22; font-size:11px; margin-bottom:4px; font-weight:bold;">※複数条件の中央値です</div>`;
                        }
                        
                        popupContent += `<b>☁️ 天気:</b> ${weather}<br>`;
                        popupContent += `<b>🌬️ 風:</b> ${windDisplay}<br>`;
                    } 
                    if (surveyType === 'indoor') {
                        const building = getProp(props, 'building') || getProp(props, '建物');
                        const floor = getProp(props, 'floor') || getProp(props, '階層');
                        if(building) popupContent += `<b>🏠 建物:</b> ${building}<br>`;
                        if(floor) popupContent += `<b>🏢 階層:</b> ${floor}<br>`;
                    }
                }
                
                popupContent += `</div>`;
                
                const maxW = window.innerWidth < 600 ? 220 : 300;
                layer.bindPopup(popupContent, { minWidth: 150, maxWidth: maxW });
            }
        }).addTo(map);
    }

    function jumpTo(lat, lng, zoom) { 
        map.flyTo([lat, lng], zoom, { duration: 1.5 }); 
        if (window.innerWidth <= 600) {
            document.getElementById('ui-panel').classList.remove('show');
            document.getElementById('legend-panel').classList.remove('show');
        }
    }
    
    function executeJump() {
        const val = document.getElementById('jump-select').value;
        const parts = val.split(',');
        if(parts.length === 3) jumpTo(parseFloat(parts[0]), parseFloat(parts[1]), parseInt(parts[2], 10));
    }

    function openModal(url) {
        document.getElementById("modalImage").style.backgroundImage = `url('${url}')`;
        document.getElementById("imageModal").style.display = "block";
    }

    function closeModal() {
        document.getElementById("imageModal").style.display = "none";
        document.getElementById("modalImage").style.backgroundImage = "none";
    }