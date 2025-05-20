// Hàm chính để lấy và hiển thị NFT
async function getNFTs() {
    const walletAddress = document.getElementById('walletAddress').value.trim();
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('error');
    const nftListDiv = document.getElementById('nftList');

    // Kiểm tra địa chỉ ví có được nhập hay không
    if (!walletAddress) {
        showError('Vui lòng nhập địa chỉ ví Ethereum');
        return;
    }

    // Kiểm tra kết nối mạng
    if (!navigator.onLine) {
        showError('Không có kết nối internet. Vui lòng kiểm tra kết nối mạng của bạn.');
        return;
    }

    // Hiển thị loading và ẩn các phần tử khác
    loadingDiv.style.display = 'block';
    errorDiv.style.display = 'none';
    nftListDiv.innerHTML = '';

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        try {
            // Thêm timeout cho request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 giây timeout

            // Gọi API để lấy danh sách NFT
            const response = await fetch('/api/nfts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ walletAddress }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const data = await response.json();

            // Kiểm tra lỗi từ API
            if (!response.ok) {
                throw new Error(data.error || 'Có lỗi xảy ra khi lấy thông tin NFT');
            }

            // Hiển thị NFT
            displayNFTs(data.nfts);
            return; // Thoát khỏi vòng lặp nếu thành công

        } catch (error) {
            retryCount++;
            
            if (error.name === 'AbortError') {
                if (retryCount === maxRetries) {
                    showError('Yêu cầu đã hết thời gian chờ. Vui lòng thử lại sau.');
                }
            } else if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
                if (retryCount === maxRetries) {
                    showError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại sau.');
                }
            } else {
                if (retryCount === maxRetries) {
                    showError(error.message);
                }
            }

            if (retryCount < maxRetries) {
                // Chờ trước khi thử lại (1s, 2s, 4s)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
            }
        }
    }

    loadingDiv.style.display = 'none';
}

// Hàm hiển thị danh sách NFT
function displayNFTs(nfts) {
    const nftListDiv = document.getElementById('nftList');
    
    // Kiểm tra nếu không có NFT nào
    if (!nfts || nfts.length === 0) {
        nftListDiv.innerHTML = '<div class="no-nft-message">' +
            '<p class="error">Không tìm thấy NFT nào trong ví này</p>' +
            '<p class="sub-error">Địa chỉ ví này không sở hữu bất kỳ NFT nào từ bộ sưu tập này</p>' +
        '</div>';
        return;
    }

    // Tạo HTML cho từng NFT
    nftListDiv.innerHTML = nfts.map(nft => `
        <div class="nft-card">
            <img src="${nft.image}" alt="NFT ${nft.tokenId}" onerror="this.src='https://via.placeholder.com/200x200?text=Image+Not+Found'">
            <h3>Token ID: ${nft.tokenId}</h3>
            <div class="nft-attributes">
                ${nft.attributes.map(attr => 
                    `<span class="attribute">${attr.trait_type}: ${attr.value}</span>`
                ).join('')}
            </div>
        </div>
    `).join('');
}

// Hàm hiển thị lỗi
function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// Thêm sự kiện cho phép nhấn Enter để tìm kiếm
document.getElementById('walletAddress').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        getNFTs();
    }
});