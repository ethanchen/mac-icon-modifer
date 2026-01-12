import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, RefreshCw, Layout, Smartphone, Circle, Settings, Info, AlertCircle } from 'lucide-react';

const MacIconMaker = () => {
  const canvasRef = useRef(null);
  const [image, setImage] = useState(null);
  const [fileName, setFileName] = useState('icon');
  const [error, setError] = useState(null);

  // 默认设置为 macOS Big Sur+ 风格
  const [settings, setSettings] = useState({
    radius: 185, // 适配 824px 尺寸的圆角 ( ~22.4% )
    margin: 100, // 标准 macOS 图标保留安全边距
    shadowBlur: 30,
    shadowOpacity: 0.4,
    shadowY: 15,
    bgColor: '#ffffff',
    useBg: true,
    scale: 0.78,
  });

  // 画布尺寸 (高清导出用)
  const CANVAS_SIZE = 1024;

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  // ICNS 解析逻辑
  const parseIcns = (buffer) => {
    const view = new DataView(buffer);

    // 检查 Magic Bytes: 'icns'
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (magic !== 'icns') {
      throw new Error("无效的 .icns 文件");
    }

    const fileSize = view.getUint32(4, false); // Big Endian
    let offset = 8;
    const images = [];

    while (offset < fileSize) {
      if (offset + 8 > fileSize) break;

      // 读取 Chunk Header
      const size = view.getUint32(offset + 4, false);
      const dataOffset = offset + 8;
      const dataSize = size - 8;

      if (dataSize <= 0 || offset + size > fileSize) {
        offset += size;
        continue;
      }

      // 检查是否是 PNG (89 50 4E 47) 或 JPEG (FF D8)
      // 许多现代 ICNS 实际上只是包装了 PNG 文件
      const b0 = view.getUint8(dataOffset);
      const b1 = view.getUint8(dataOffset + 1);

      let mimeType = null;
      if (b0 === 0x89 && b1 === 0x50) {
        mimeType = 'image/png';
      } else if (b0 === 0xFF && b1 === 0xD8) {
        mimeType = 'image/jpeg';
      }

      // 只提取浏览器能直接渲染的格式 (PNG/JPEG)
      // 跳过 JPEG 2000 (Chrome 不支持) 和 ARGB/RLE (旧格式)
      if (mimeType) {
        const blob = new Blob([new Uint8Array(buffer, dataOffset, dataSize)], { type: mimeType });
        images.push({ size: dataSize, blob });
      }

      offset += size;
    }

    if (images.length === 0) {
      throw new Error("此 .icns 文件中未包含标准 PNG/JPEG 数据 (可能是 JPEG2000 或旧版 RLE 压缩)");
    }

    // 按文件大小排序，取最大的（通常也是分辨率最高的）
    images.sort((a, b) => b.size - a.size);
    return images[0].blob;
  };

  const processFile = (file) => {
    setError(null);
    const ext = file.name.split('.').pop().toLowerCase();
    setFileName(file.name.split('.')[0]);

    if (ext === 'icns') {
      // 处理 ICNS
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const blob = parseIcns(e.target.result);
          const imgUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => setImage(img);
          img.onerror = () => setError("无法解析提取的图片数据");
          img.src = imgUrl;
        } catch (err) {
          setError(err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // 处理普通图片
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => setImage(img);
        img.onerror = () => setError("无效的图片文件");
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // 从 HTML 中提取图片 URL 并 fetch
  const fetchImageFromHtml = async (html) => {
    console.log('[Paste] 解析 HTML:', html);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const img = doc.querySelector('img');
    if (!img?.src) {
      console.log('[Paste] HTML 中未找到 img 标签');
      return null;
    }

    console.log('[Paste] 找到图片 URL:', img.src);
    try {
      const response = await fetch(img.src);
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      console.log('[Paste] Fetch 成功, blob:', blob);
      return new File([blob], 'pasted_image.png', { type: blob.type });
    } catch (err) {
      console.log('[Paste] Fetch 图片失败:', err);
      setError('无法获取剪贴板中的图片，可能是跨域限制');
      return null;
    }
  };

  // 全局监听剪贴板粘贴图片
  useEffect(() => {
    const handlePaste = async (e) => {
      console.log('[Paste] 事件触发', e);
      const items = e.clipboardData?.items;
      console.log('[Paste] clipboardData items:', items);
      if (!items) {
        console.log('[Paste] 无 items，退出');
        return;
      }

      console.log('[Paste] items 数量:', items.length);

      // 优先检查是否有直接的图片数据
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(`[Paste] item[${i}] type:`, item.type, 'kind:', item.kind);
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          console.log('[Paste] 获取到图片文件:', file);
          if (file) {
            setFileName('pasted_icon');
            processFile(file);
          }
          return;
        }
      }

      // 没有直接图片，尝试解析 HTML 中的 img
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type === 'text/html') {
          e.preventDefault();
          item.getAsString(async (html) => {
            const file = await fetchImageFromHtml(html);
            if (file) {
              setFileName('pasted_icon');
              processFile(file);
            }
          });
          return;
        }
      }
    };

    console.log('[Paste] 注册全局 paste 监听');
    document.addEventListener('paste', handlePaste);
    return () => {
      console.log('[Paste] 移除全局 paste 监听');
      document.removeEventListener('paste', handlePaste);
    };
  }, []);

  // 绘制逻辑
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 清空画布
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const { radius, margin, shadowBlur, shadowOpacity, shadowY, bgColor, useBg, scale } = settings;

    // 计算实际绘制区域（留出阴影空间）
    // const margin = 60; // Removed hardcoded margin
    const drawSize = CANVAS_SIZE - (margin * 2);
    const x = margin;
    const y = margin;

    // 1. 绘制阴影 (在裁剪区域之外)
    ctx.save();
    ctx.beginPath();
    drawRoundedRect(ctx, x, y, drawSize, drawSize, radius);
    ctx.shadowColor = `rgba(0, 0, 0, ${shadowOpacity})`;
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetY = shadowY;
    ctx.shadowOffsetX = 0;
    if (useBg) {
      ctx.fillStyle = bgColor;
      ctx.fill();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.restore();

    // 2. 绘制主体形状 (Clip mask)
    ctx.save();
    ctx.beginPath();
    drawRoundedRect(ctx, x, y, drawSize, drawSize, radius);
    ctx.clip();

    // 3. 绘制背景颜色
    if (useBg) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }

    // 4. 绘制图片
    if (image) {
      const imgSize = drawSize;

      // 计算图片保持比例的尺寸
      let drawW = imgSize * scale;
      let drawH = imgSize * scale;
      const aspect = image.width / image.height;

      if (aspect > 1) {
        drawH = drawW / aspect;
      } else {
        drawW = drawH * aspect;
      }

      const imgX = x + (imgSize - drawW) / 2;
      const imgY = y + (imgSize - drawH) / 2;

      ctx.drawImage(image, imgX, imgY, drawW, drawH);
    } else {
      // 占位符提示
      ctx.fillStyle = '#e5e7eb';
      ctx.font = 'bold 80px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#9ca3af';
      ctx.fillText('拖入图片', CANVAS_SIZE / 2, CANVAS_SIZE / 2);
    }

    ctx.restore();

  }, [image, settings]);

  // 辅助函数：绘制圆角矩形
  const drawRoundedRect = (ctx, x, y, w, h, r) => {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `${fileName}_macos_icon.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const applyPreset = (type) => {
    switch (type) {
      case 'macos':
        setSettings(s => ({ ...s, radius: 185, margin: 100, shadowOpacity: 0.4, shadowBlur: 30, shadowY: 15, scale: 0.78 }));
        break;
      case 'ios':
        setSettings(s => ({ ...s, radius: 190, margin: 60, shadowOpacity: 0, shadowY: 0, scale: 1 }));
        break;
      case 'circle':
        setSettings(s => ({ ...s, radius: 512, margin: 60, scale: 0.74 }));
        break;
      default:
        break;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans selection:bg-blue-100 p-4 md:p-8 flex flex-col items-center">

      {/* 头部 */}
      <header className="w-full max-w-6xl mb-8 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg flex items-center justify-center text-white">
            <Layout size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">macOS 图标工坊</h1>
        </div>
      </header>

      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">

        {/* 第一块：图片区域 */}
        <div className="flex flex-col h-full">
          <div
            className={`bg-white rounded-2xl shadow-sm border transition-all relative min-h-[400px] flex flex-col p-6 overflow-hidden h-full ${image
              ? 'border-gray-200'
              : `hover:border-blue-400 group ${error ? 'border-red-300 bg-red-50' : 'border-gray-200'} cursor-pointer`
              }`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files?.[0];
              if (file) {
                processFile(file);
              }
            }}
            onClick={() => {
              if (!image) {
                document.getElementById('fileUpload').click();
              }
            }}
          >
            <input
              id="fileUpload"
              type="file"
              accept="image/*,.icns"
              className="hidden"
              onChange={handleImageUpload}
            />

            {image ? (
              /* 有图片时：显示预览画布 */
              <div className="relative w-full flex-1 flex items-center justify-center mb-4">
                <div className="relative inline-grid grid-cols-[24px_1fr_24px] grid-rows-[24px_1fr_24px]">
                  {/* 左上角 */}
                  <div className="w-6 h-6 border-r border-b border-gray-300 bg-gray-50/90"></div>
                  {/* 上标尺 */}
                  <div className="border-b border-gray-300 bg-gray-50/90 flex items-end justify-between px-2 text-[10px] text-gray-500 font-mono">
                    <span>0</span>
                    <span>{CANVAS_SIZE / 2}px</span>
                    <span>{CANVAS_SIZE}px</span>
                  </div>
                  {/* 右上角 */}
                  <div className="w-6 h-6 border-l border-b border-gray-300 bg-gray-50/90"></div>

                  {/* 左标尺 */}
                  <div className="border-r border-gray-300 bg-gray-50/90 flex flex-col items-end justify-between py-2 text-[10px] text-gray-500 font-mono">
                    <span>0</span>
                    <span>{CANVAS_SIZE / 2}</span>
                    <span>{CANVAS_SIZE}</span>
                  </div>
                  {/* Canvas */}
                  <div
                    className="relative"
                    style={{
                      backgroundColor: '#ffffff',
                      backgroundImage: 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
                      backgroundSize: '20px 20px',
                      backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                    }}
                  >
                    <canvas
                      ref={canvasRef}
                      width={CANVAS_SIZE}
                      height={CANVAS_SIZE}
                      className="max-w-full max-h-full w-auto h-auto object-contain block border border-gray-200"
                      style={{ maxWidth: '100%', maxHeight: '100%' }}
                    />
                  </div>
                  {/* 右标尺 */}
                  <div className="border-l border-gray-300 bg-gray-50/90 flex flex-col items-start justify-between py-2 text-[10px] text-gray-500 font-mono">
                    <span>0</span>
                    <span>{CANVAS_SIZE / 2}</span>
                    <span>{CANVAS_SIZE}</span>
                  </div>

                  {/* 左下角 */}
                  <div className="w-6 h-6 border-r border-t border-gray-300 bg-gray-50/90"></div>
                  {/* 下标尺 */}
                  <div className="border-t border-gray-300 bg-gray-50/90 flex items-start justify-between px-2 text-[10px] text-gray-500 font-mono">
                    <span>0</span>
                    <span>{CANVAS_SIZE / 2}px</span>
                    <span>{CANVAS_SIZE}px</span>
                  </div>
                  {/* 右下角 */}
                  <div className="w-6 h-6 border-l border-t border-gray-300 bg-gray-50/90"></div>
                </div>
              </div>
            ) : (
              /* 无图片时：显示上传提示 */
              <div className="text-center w-full flex-1 flex flex-col items-center justify-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform ${error ? 'bg-red-100 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                  {error ? <AlertCircle size={28} /> : <Upload size={28} />}
                </div>
                <h3 className="font-semibold text-gray-900">点击、拖拽或粘贴上传</h3>
                <p className="text-xs text-gray-500 mt-1">支持 PNG, JPG, SVG, ICNS · 可直接 <kbd className="bg-gray-100 px-1 rounded">Cmd+V</kbd> 粘贴</p>
                {error && <p className="text-xs text-red-500 mt-2 font-medium">{error}</p>}
              </div>
            )}

            {/* 底部按钮区域 */}
            {image && (
              <div className="flex gap-2 mt-auto">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    document.getElementById('fileUpload').click();
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      processFile(file);
                    }
                  }}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg shadow transition-all hover:scale-105 active:scale-95 text-sm flex-1"
                >
                  <Upload size={14} />
                  <span>重新上传</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload();
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95 text-sm flex-1 font-semibold"
                >
                  <Download size={16} />
                  <span>下载 PNG 图标</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 第二块：调整区域 */}
        <div className="flex flex-col h-full">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 space-y-5 h-full flex flex-col">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Settings size={14} /> 图标调整
            </h3>

            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 whitespace-nowrap">预设：</span>
                <div className="flex items-center gap-2 flex-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); applyPreset('macos'); }}
                    className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition-colors flex-1"
                    title="macOS"
                  >
                    <Layout className="text-gray-600 mb-1" size={16} />
                    <span className="text-xs text-gray-600">macOS</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); applyPreset('ios'); }}
                    className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition-colors flex-1"
                    title="iOS / 平铺"
                  >
                    <Smartphone className="text-gray-600 mb-1" size={16} />
                    <span className="text-xs text-gray-600">iOS</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); applyPreset('circle'); }}
                    className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition-colors flex-1"
                    title="圆形"
                  >
                    <Circle className="text-gray-600 mb-1" size={16} />
                    <span className="text-xs text-gray-600">圆形</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 缩放 (Top Priority) */}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-500">图标缩放</label>
                <span className="text-xs text-gray-400">{(settings.scale * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range" min="0.1" max="1.5" step="0.01"
                value={settings.scale}
                onChange={(e) => setSettings({ ...settings, scale: Number(e.target.value) })}
                className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* 外边距 */}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-500">外边距</label>
                <span className="text-xs text-gray-400">{settings.margin}px</span>
              </div>
              <input
                type="range" min="0" max="250"
                value={settings.margin}
                onChange={(e) => setSettings({ ...settings, margin: Number(e.target.value) })}
                className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* 圆角 */}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-500">圆角半径</label>
                <span className="text-xs text-gray-400">{settings.radius}px</span>
              </div>
              <input
                type="range" min="0" max="512"
                value={settings.radius}
                onChange={(e) => setSettings({ ...settings, radius: Number(e.target.value) })}
                className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>



            {/* 阴影 */}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-500">阴影强度</label>
                <span className="text-xs text-gray-400">{settings.shadowOpacity}</span>
              </div>
              <input
                type="range" min="0" max="1" step="0.05"
                value={settings.shadowOpacity}
                onChange={(e) => setSettings({ ...settings, shadowOpacity: Number(e.target.value) })}
                className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            {/* 背景色 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-500">启用背景色</label>
                <input
                  type="color"
                  value={settings.bgColor}
                  onChange={(e) => setSettings({ ...settings, bgColor: e.target.value })}
                  className="w-8 h-8 cursor-pointer p-0 overflow-hidden"
                  disabled={!settings.useBg}
                />
              </div>
              <button
                onClick={() => setSettings({ ...settings, useBg: !settings.useBg })}
                className={`w-10 h-6 rounded-full transition-colors relative ${settings.useBg ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${settings.useBg ? 'translate-x-4' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* 第三块：说明区域 */}
        <div className="flex flex-col h-full">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 h-full flex flex-col">
            {/* 使用说明 */}
            <div className="w-full">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">如何应用到 Mac App？</h3>
              <ol className="list-decimal pl-4 space-y-2 text-sm text-gray-700">
                <li>在预览图片上右键选择"复制图片"，或者下载图片后再复制。</li>
                <li>在 Finder 中找到你要修改的 App，按 <kbd className="bg-gray-100 px-1 rounded">Cmd+I</kbd> 打开简介。</li>
                <li>点击左上角的小图标，按 <kbd className="bg-gray-100 px-1 rounded">Cmd+V</kbd> 粘贴即可。</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MacIconMaker;