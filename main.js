function toggleMenu() { document.getElementById('ui-panel').classList.toggle('show'); }
    function toggleLegend() { document.getElementById('legend-panel').classList.toggle('show'); }

    if (typeof THEME_CONFIG !== 'undefined') {
        Object.keys(THEME_CONFIG).forEach(theme => {
            if (!THEME_CONFIG[theme]) {
                const opt = document.querySelector("#map-theme option[value='" + theme + "']");
                if (opt) opt.remove();
            }
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const startLat = parseFloat(urlParams.get('lat')) || 36.3992; 
    const startLng = parseFloat(urlParams.get('lng')) || 137.7152; 
    const startZoom = parseInt(urlParams.get('zoom')) || 18; 
    const startTheme = urlParams.get('theme');

    if (startTheme) {
        const themeSelect = document.getElementById('map-theme');
        if (Array.from(themeSelect.options).some(opt => opt.value === startTheme)) {
            themeSelect.value = startTheme;
        }
    }

    const map = L.map('map', { maxZoom: 22, zoomControl: false }).setView([startLat, startLng], startZoom);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', { maxNativeZoom: 18, maxZoom: 22 }).addTo(map);

    map.createPane('gridPane');
    map.getPane('gridPane').style.zIndex = 400; 
    map.getPane('gridPane').style.opacity = 0.6; 

    let currentLayer = null;
    let allFeatures = [];
    
    // 動物（ライチョウ等）を円でまとめるクラスタリンググループの設定
    let animalClusterGroup = L.markerClusterGroup({
        disableClusteringAtZoom: 16,
        zoomToBoundsOnClick: false
    }).addTo(map);

    animalClusterGroup.on('clusterclick', function (a) {
        const markers = a.layer.getAllChildMarkers();
        let latestMarker = markers[0];
        let latestDateStr = getProp(latestMarker.feature.properties, 'date') || getProp(latestMarker.feature.properties, '日付') || "1970-01-01";
        
        markers.forEach(m => {
            const d = getProp(m.feature.properties, 'date') || getProp(m.feature.properties, '日付') || "1970-01-01";
            if (d > latestDateStr) {
                latestDateStr = d;
                latestMarker = m;
            }
        });
        
        const speciesFilter = document.getElementById('filter-species') ? document.getElementById('filter-species').value : 'ALL';
        const animalName = speciesFilter !== 'ALL' ? speciesFilter : '動物・鳥類';

        // ★修正：エラーの原因になりやすい複雑な埋め込みを、安全な足し算（+）にしました
        const popupContent = 
            '<div style="text-align:center; margin-bottom:8px; padding-bottom:5px; border-bottom:2px dashed #ccc;">' +
                '<b><span style="font-size:16px; color:#2c3e50;">🐾 ' + animalName + ' 計 ' + markers.length + ' 件</span></b><br>' +
                '<span style="font-size:11px; color:#666;">※このエリアの最新記録を表示</span>' +
            '</div>' +
            latestMarker.getPopup().getContent();
            
        L.popup().setLatLng(a.layer.getLatLng()).setContent(popupContent).openOn(map);
    });

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
        { url: 'data/autumn_survey.geojson', type: 'autumn' },
        { url: 'data/animal_survey.geojson', type: 'animal' } 
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
        const isActive = (theme) => {
            return typeof THEME_CONFIG === 'undefined' || THEME_CONFIG[theme] !== false;
        };
        
        if ((mapTheme === 'indoor' || mapTheme === 'outdoor' || mapTheme === 'ALL') && (isActive('indoor') || isActive('outdoor'))) {
            html += `<div class="legend-title">📶 電波強度</div>
                <div class="legend-item"><div class="color-box" style="background:#00FF00;"></div>4 (非常に良好)</div>
                <div class="legend-item"><div class="color-box" style="background:#FFFF00;"></div>3 (良好)</div>
                <div class="legend-item"><div class="color-box" style="background:#FFA500;"></div>2 (やや弱い)</div>
                <div class="legend-item"><div class="color-box" style="background:#FF0000;"></div>1 (非常に弱い)</div>
                <div class="legend-item"><div class="color-box" style="background:#808080;"></div>0 (圏外・測定不可)</div>
                <div class="legend-item"><div class="color-box" style="background:#1E90FF;"></div>衛星 (Starlink等)</div>`;
        }
        
        if ((mapTheme === 'flower' || mapTheme === 'ALL') && isActive('flower')) {
            if (html !== '') html += `<div style="margin:12px 0; border-top:1px solid #ccc;"></div>`;
            html += `<div class="legend-title">🌸 開花状況</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#32CD32;"></div>つぼみ</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#FFB6C1;"></div>咲き始め</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#FF1493;"></div>見頃・満開</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#FFA500;"></div>散り始め</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#8B4513;"></div>終了・葉桜</div>`;
        }
        
        if ((mapTheme === 'autumn' || mapTheme === 'ALL') && isActive('autumn')) {
            if (html !== '') html += `<div style="margin:12px 0; border-top:1px solid #ccc;"></div>`;
            html += `<div class="legend-title">🍁 紅葉状況</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#228B22;"></div>青葉・緑葉</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#FFA500;"></div>色づき始め</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#DC143C;"></div>見頃・紅葉</div>
                <div class="legend-item"><div class="color-box circle-box" style="background:#8B4513;"></div>枯れ・落葉</div>`;
        }

        if ((mapTheme === 'animal' || mapTheme === 'ALL') && isActive('animal')) {
            if (html !== '') html += `<div style="margin:12px 0; border-top:1px solid #ccc;"></div>`;
            html += `<div class="legend-title">🐾 動物・鳥類観察</div>
                <div class="legend-item">複数羽の重なりは円と数字で集約されます。<br>円をクリックすると最新の記録を確認できます。</div>`;
        }
        
        panel.innerHTML = html;
    }

    function populateNatureDropdowns(theme) {
        const speciesSelect = document.getElementById('filter-species');
        const weatherSelect = document.getElementById('filter-nature-weather');
        
        if(speciesSelect) speciesSelect.innerHTML = '<option value="ALL">すべての種類</option>';
        if(weatherSelect) weatherSelect.innerHTML = '<option value="ALL">すべての天気</option>';
        
        const speciesSet = new Set();
        const weatherSet = new Set();
        
        allFeatures.forEach(f => {
            if (f.properties.surveyType === theme) {
                const name = getProp(f.properties, 'name') || getProp(f.properties, '名前');
                if (name) speciesSet.add(name);
                
                const weather = getProp(f.properties, 'weather') || getProp(f.properties, '天気');
                if (weather) weatherSet.add(weather);
            }
        });

        if(speciesSelect) {
            Array.from(speciesSet).sort().forEach(species => {
                const opt = document.createElement('option');
                opt.value = species; opt.textContent = species; 
                speciesSelect.appendChild(opt);
            });
        }
        if(weatherSelect) {
            Array.from(weatherSet).sort().forEach(w => {
                const opt = document.createElement('option');
                opt.value = w; opt.textContent = w; 
                weatherSelect.appendChild(opt);
            });
        }
    }

    function populateFloorDropdown() {
        const select = document.getElementById('filter-floor');
        if(!select) return;
        select.innerHTML = '<option value="ALL">すべての階層</option>';
        
        const floorSet = new Set();
        allFeatures.forEach(f => {
            if (f.properties.surveyType === 'indoor') {
                const floor = getProp(f.properties, 'floor') || getProp(props, '階層');
                if (floor) floorSet.add(floor);
            }
        });

        Array.from(floorSet).sort().forEach(floor => {
            const option = document.createElement('option');
            option.value = floor; option.textContent = floor; 
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

        if (mapTheme === 'flower' || mapTheme === 'autumn' || mapTheme === 'animal') {
            if(rfGroup) rfGroup.style.display = 'none'; 
            if(natureGroup) natureGroup.style.display = 'block';
            
            const speciesLabel = document.getElementById('filter-species-label');
            if(speciesLabel) {
                if (mapTheme === 'flower') speciesLabel.innerText = '🌸 植物の種類';
                else if (mapTheme === 'autumn') speciesLabel.innerText = '🍁 樹木の種類';
                else if (mapTheme === 'animal') speciesLabel.innerText = '🐾 動物の種類';
            }
            populateNatureDropdowns(mapTheme);
        } else {
            if(rfGroup) rfGroup.style.display = 'block'; 
            if(natureGroup) natureGroup.style.display = 'none';
            if (mapTheme === 'indoor') {
                if(weatherGroup) weatherGroup.style.display = 'none'; 
                if(windDirGroup) windDirGroup.style.display = 'none'; 
                if(windStrGroup) windStrGroup.style.display = 'none'; 
                if(floorGroup) floorGroup.style.display = 'block';
                populateFloorDropdown();
            } else if (mapTheme === 'outdoor') {
                if(weatherGroup) weatherGroup.style.display = 'block'; 
                if(windDirGroup) windDirGroup.style.display = 'block'; 
                if(windStrGroup) windStrGroup.style.display = 'block'; 
                if(floorGroup) floorGroup.style.display = 'none';
            } else { 
                if(weatherGroup) weatherGroup.style.display = 'block'; 
                if(windDirGroup) windDirGroup.style.display = 'block'; 
                if(windStrGroup) windStrGroup.style.display = 'block'; 
                if(floorGroup) floorGroup.style.display = 'none'; 
            }
        }
        applyFilters();
    }

    function applyFilters() {
        const mapTheme = document.getElementById('map-theme').value;
        const selectedCarrier = document.getElementById('filter-carrier') ? document.getElementById('filter-carrier').value : 'ALL';
        const selectedOutdoorWeather = document.getElementById('filter-weather') ? document.getElementById('filter-weather').value : 'ALL';
        
        const windStrSelect = document.getElementById('filter-wind-str');
        const windDirSelect = document.getElementById('filter-wind-dir');
        
        if (windStrSelect && windDirSelect) {
            if (windStrSelect.value === '無風') {
                windDirSelect.value = 'ALL';
                windDirSelect.disabled = true;
            } else {
                windDirSelect.disabled = false;
            }
        }
        
        const selectedWindStr = windStrSelect ? windStrSelect.value : 'ALL'; 
        const selectedWindDir = windDirSelect ? windDirSelect.value : 'ALL';
        const selectedFloor = document.getElementById('filter-floor') ? document.getElementById('filter-floor').value : 'ALL';

        const selectedSpecies = document.getElementById('filter-species') ? document.getElementById('filter-species').value : 'ALL';
        const selectedNatureWeather = document.getElementById('filter-nature-weather') ? document.getElementById('filter-nature-weather').value : 'ALL';
        const selectedDate = document.getElementById('filter-date') ? document.getElementById('filter-date').value : '';

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
                    if (selectedOutdoorWeather !== "ALL") {
                        const weather = getProp(props, 'weather') || '';
                        if (weather !== selectedOutdoorWeather && !weather.includes(selectedOutdoorWeather)) return false;
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
            if (surveyType === 'flower' || surveyType === 'autumn' || surveyType === 'animal') {
                const name = getProp(props, 'name') || getProp(props, '名前');
                if (selectedSpecies !== "ALL" && name !== selectedSpecies) return false;

                const fWeather = getProp(props, 'weather') || getProp(props, '天気');
                if (selectedNatureWeather !== "ALL" && fWeather !== selectedNatureWeather) return false;

                if (selectedDate) {
                    const fDate = getProp(props, 'date') || getProp(props, '日付') || '';
                    if (!fDate.startsWith(selectedDate)) return false;
                }
            }
            return true;
        });

        const finalFeatures = [];
        const rfGroups = {};

        filteredFeatures.forEach(feature => {
            const props = feature.properties;
            const surveyType = props.surveyType;

            if (surveyType === 'indoor' || surveyType === 'outdoor') {
                let key = null;
                if (feature.geometry.type === 'Polygon') {
                    const c = feature.geometry.coordinates[0][0]; 
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
                finalFeatures.push(feature); 
            }
        });

        Object.values(rfGroups).forEach(group => {
            const clonedFeature = JSON.parse(JSON.stringify(group.baseFeature)); 
            if (group.levels.length > 0) {
                group.levels.sort((a, b) => a - b);
                const mid = Math.floor(group.levels.length / 2);
                const median = group.levels.length % 2 === 0 
                    ? Math.round((group.levels[mid - 1] + group.levels[mid]) / 2) 
                    : group.levels[mid];
                
                Object.keys(clonedFeature.properties).forEach(k => {
                    const lowerK = k.toLowerCase();
                    if (['signallevel', 'weather', 'winddirection', 'windstrength'].includes(lowerK)) {
                        delete clonedFeature.properties[k];
                    }
                });
                
                clonedFeature.properties.SignalLevel = median;
                clonedFeature.properties.Weather = Array.from(group.weathers).filter(Boolean).join(', ') || '不明';
                clonedFeature.properties.WindDirection = Array.from(group.windDirs).filter(Boolean).join(', ');
                clonedFeature.properties.WindStrength = Array.from(group.windStrs).filter(Boolean).join(', ');
                clonedFeature.properties.isMerged = group.levels.length > 1; 
            }
            finalFeatures.push(clonedFeature);
        });

        if (currentLayer) map.removeLayer(currentLayer);
        if (animalClusterGroup) animalClusterGroup.clearLayers();

        const normalFeatures = [];
        const animalFeatures = [];

        finalFeatures.forEach(f => {
            if (f.properties.surveyType === 'animal') {
                animalFeatures.push(f);
            } else {
                normalFeatures.push(f);
            }
        });

        const geojsonOptions = {
            style: function (feature) {
                if (feature.geometry.type !== 'Point') {
                    return { stroke: false, fillColor: getThemeColor(feature.properties, feature.properties.surveyType), fillOpacity: 1.0, pane: 'gridPane' };
                }
            },
            pointToLayer: function (feature, latlng) {
                const props = feature.properties;
                const surveyType = props.surveyType;
                
                if (surveyType === 'animal') {
                    return L.marker(latlng);
                }

                const bgColor = getThemeColor(props, surveyType); 
                
                if (surveyType === 'flower' || surveyType === 'autumn') {
                    const isOld = isStale(getProp(props, 'date'));
                    const fillOp = isOld ? 0.1 : 0.6;
                    const lineOp = isOld ? 0.3 : 0.8;

                    const radiusMeters = parseFloat(getProp(props, 'radius_m'));
                    if (!isNaN(radiusMeters) && radiusMeters > 0) {
                        return L.circle(latlng, { radius: radiusMeters, color: '#fff', weight: 1.5, fillColor: bgColor, fillOpacity: fillOp, opacity: lineOp });
                    } else {
                        return L.circleMarker(latlng, { radius: 8, color: '#fff', weight: 1.5, fillColor: bgColor, fillOpacity: fillOp, opacity: lineOp });
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
                let popupContent = '<div style="font-size: 13px;">';
                
                if ((surveyType === 'flower' || surveyType === 'autumn' || surveyType === 'animal') && isStale(getProp(props, 'date'))) {
                    popupContent += '<div style="color:red; font-weight:bold; font-size:12px; margin-bottom:5px;">⚠️ 1週間以上前の情報です</div>';
                }

                const photoUrl = getProp(props, 'photo') || getProp(props, '写真');
                if (photoUrl && photoUrl.startsWith('http')) {
                    popupContent += '<div onclick="openModal(\'' + photoUrl + '\')" class="popup-img-box" style="background-image: url(\'' + photoUrl + '\');"></div>';
                }
                
                // ★修正：エラーの原因になりやすい複雑な埋め込みを、安全な文字列結合（+）にしました
                if (surveyType === 'flower' || surveyType === 'autumn' || surveyType === 'animal') {
                    let title = '🐾 動物・鳥類観察';
                    if (surveyType === 'flower') title = '🌸 開花状況';
                    if (surveyType === 'autumn') title = '🍁 紅葉状況';

                    const nameStr = getProp(props, 'name') || getProp(props, '名前') || '不明';
                    
                    popupContent += '<b>' + title + '</b><hr>';
                    popupContent += '<b>種類:</b> ' + nameStr + '<br>';
                    
                    if(surveyType !== 'animal') {
                        const statusStr = getProp(props, 'status') || '不明';
                        popupContent += '<b>状況:</b> <span style="font-size:15px; font-weight:bold;">' + statusStr + '</span><br>';
                    }
                    
                    const dateStr = getProp(props, 'date') || getProp(props, '日付') || '-';
                    popupContent += '<b>確認日:</b> ' + dateStr + '<br>';
                    
                    if (surveyType === 'animal') {
                        const wStr = getProp(props, 'weather') || getProp(props, '天気');
                        if (wStr) popupContent += '<b>天気:</b> ' + wStr + '<br>';
                    }

                    const memoStr = getProp(props, 'memo') || getProp(props, 'メモ');
                    if(memoStr) popupContent += '<br><b>📝 メモ:</b><br><span style="color:#555;">' + memoStr + '</span>';
                } 
                else {
                    const carrierStr = getProp(props, 'carrier') || '不明';
                    const sigStr = getProp(props, 'signallevel') || '-';
                    popupContent += '<b>📡 キャリア:</b> ' + carrierStr + '<br>';
                    popupContent += '<b>📶 電波強度:</b> ' + sigStr + '<br>';
                    
                    if (surveyType === 'outdoor') {
                        const weatherStr = getProp(props, 'weather') || getProp(props, '天気') || '不明';
                        const windDirStr = getProp(props, 'winddirection') || getProp(props, '風向') || '';
                        const windStrVal = getProp(props, 'windstrength') || getProp(props, '風力') || '';
                        const windDisplay = windDirStr ? (windDirStr + ' / ' + windStrVal) : '-';
                        
                        if (props.isMerged) {
                            popupContent += '<div style="color:#e67e22; font-size:11px; margin-bottom:4px; font-weight:bold;">※複数条件の中央値です</div>';
                        }
                        
                        popupContent += '<b>☁️ 天気:</b> ' + weatherStr + '<br>';
                        popupContent += '<b>🌬️ 風:</b> ' + windDisplay + '<br>';
                    } 
                    if (surveyType === 'indoor') {
                        const buildingStr = getProp(props, 'building') || getProp(props, '建物');
                        const floorStr = getProp(props, 'floor') || getProp(props, '階層');
                        if(buildingStr) popupContent += '<b>🏠 建物:</b> ' + buildingStr + '<br>';
                        if(floorStr) popupContent += '<b>🏢 階層:</b> ' + floorStr + '<br>';
                    }
                }
                
                popupContent += '</div>';
                const maxW = window.innerWidth < 600 ? 220 : 300;
                layer.bindPopup(popupContent, { minWidth: 150, maxWidth: maxW });
            }
        };

        currentLayer = L.geoJSON({ "type": "FeatureCollection", "features": normalFeatures }, geojsonOptions).addTo(map);

        if (animalFeatures.length > 0 && animalClusterGroup) {
            L.geoJSON({ "type": "FeatureCollection", "features": animalFeatures }, geojsonOptions).addTo(animalClusterGroup);
        }
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
        document.getElementById("modalImage").style.backgroundImage = "url('" + url + "')";
        document.getElementById("imageModal").style.display = "block";
    }

    function closeModal() {
        document.getElementById("imageModal").style.display = "none";
        document.getElementById("modalImage").style.backgroundImage = "none";
    }