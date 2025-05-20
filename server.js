// Import các thư viện cần thiết
const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
require('dotenv').config();

// Xử lý lỗi không được bắt
process.on('uncaughtException', (error) => {
    console.error('Lỗi không được bắt:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Promise rejection không được xử lý:', error);
});

// Khởi tạo Express app
const app = express();
app.use(express.json());
app.use(cors());

// Phục vụ các file tĩnh từ thư mục public
app.use(express.static('public'));

// Cấu hình kết nối với BASE Mainnet
let provider;
try {
    if (!process.env.BASE_RPC_URL) {
        throw new Error('BASE_RPC_URL không được cấu hình trong file .env');
    }
    provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
} catch (error) {
    console.error('Lỗi khởi tạo provider:', error);
    process.exit(1);
}

const contractAddress = '0x0e381cd73faa421066dc5e2829a973405352168c';

// ABI tối thiểu để truy vấn NFT
const minABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
    'function tokenURI(uint256 tokenId) view returns (string)'
];

const nftContract = new ethers.Contract(contractAddress, minABI, provider);

// API endpoint để lấy danh sách NFT
app.post('/api/nfts', async (req, res) => {
    try {
        const { walletAddress } = req.body;
        
        // Kiểm tra địa chỉ ví hợp lệ
        if (!walletAddress || !ethers.isAddress(walletAddress)) {
            return res.status(400).json({ error: 'Địa chỉ ví không hợp lệ hoặc không được cung cấp' });
        }

        // Chuẩn hóa địa chỉ ví
        const normalizedAddress = ethers.getAddress(walletAddress);

        // Kiểm tra kết nối với BASE Mainnet
        try {
            await provider.getNetwork();
        } catch (networkError) {
            console.error('Lỗi kết nối BASE Mainnet:', networkError);
            return res.status(503).json({ error: 'Không thể kết nối với BASE Mainnet. Vui lòng thử lại sau.' });
        }

        // Lấy số lượng NFT của địa chỉ ví với timeout
        let balance;
        try {
            console.log(`Đang lấy số lượng NFT cho địa chỉ: ${normalizedAddress}`);
            const balancePromise = nftContract.balanceOf(normalizedAddress);
            balance = await Promise.race([
                balancePromise,
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout khi lấy số lượng NFT')), 15000)
                )
            ]);

            if (balance === undefined) {
                throw new Error('Không nhận được phản hồi khi truy vấn số lượng NFT');
            }

            console.log(`Số lượng NFT tìm thấy: ${balance.toString()}`);
            
            // Kiểm tra nếu balance là 0
            if (balance.toString() === '0') {
                return res.status(404).json({ 
                    error: 'Không tìm thấy NFT nào trong ví này',
                    details: 'Địa chỉ ví này không sở hữu bất kỳ NFT nào từ bộ sưu tập này'
                });
            }
        } catch (balanceError) {
            console.error('Lỗi khi lấy số lượng NFT:', balanceError);
            if (balanceError.message.includes('Timeout')) {
                return res.status(504).json({ error: 'Hết thời gian chờ khi lấy thông tin NFT. Vui lòng thử lại sau.' });
            }
            return res.status(500).json({ 
                error: 'Không thể lấy thông tin số lượng NFT từ ví',
                details: balanceError.message
            });
        }

        const nfts = [];

        // Lấy thông tin của từng NFT
        for (let i = 0; i < balance; i++) {
            try {
                // Lấy token ID với timeout
                const tokenIdPromise = nftContract.tokenOfOwnerByIndex(normalizedAddress, i);
                const tokenId = await Promise.race([
                    tokenIdPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout khi lấy token ID')), 10000))
                ]);

                // Lấy token URI với timeout
                const tokenURIPromise = nftContract.tokenURI(tokenId);
                const tokenURI = await Promise.race([
                    tokenURIPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout khi lấy token URI')), 10000))
                ]);
                
                // Lấy metadata từ tokenURI với timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                const response = await fetch(tokenURI, { signal: controller.signal });
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`Lỗi khi lấy metadata! Mã lỗi: ${response.status}`);
                }
                
                const metadata = await response.json();
                
                nfts.push({
                    tokenId: tokenId.toString(),
                    image: metadata.image || '',
                    attributes: metadata.attributes || []
                });
            } catch (nftError) {
                console.error(`Lỗi khi lấy thông tin NFT #${i}:`, nftError);
                // Tiếp tục với NFT tiếp theo nếu có lỗi
                continue;
            }
        }

        if (nfts.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy NFT nào trong ví này' });
        }

        res.json({ nfts });
    } catch (error) {
        console.error('Lỗi khi lấy thông tin NFT:', error);
        res.status(500).json({ 
            error: 'Lỗi server khi lấy thông tin NFT',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});