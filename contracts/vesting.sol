// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./utils/AccessProtected.sol";

contract Vesting is AccessProtected {
    using SafeMath for uint256;
    using Address for address;
    address public tokenAddress;

    struct Claim {
        bool isActive;
        uint256 totalAmount;
        uint256 startTime;
        uint256 cliffTime;
        uint256 endTime;
        uint256 inUnlockedAmount;
        uint256 amountClaimed;
    }

    mapping(address => Claim) private claims;

    event ClaimCreated(
        address _creator,
        address _beneficiary,
        uint256 _totalAmount,
        uint256 _startTime,
        uint256 _cliffTime,
        uint256 _endTime
    );
    event Claimed(address _beneficiary, uint256 _amount);
    event Revoked(address _beneficiary);

    constructor(address _tokenAddress) {
        tokenAddress = _tokenAddress;
    }

    function _createClaim(
        address _beneficiary,
        uint256 _totalAmount,
        uint64 _startTime,
        uint256 _cliffTime,
        uint64 _endTime,
        uint256 _inUnlockedAmount
    ) private {
        require(_endTime >= _startTime, "INVALID_TIME");
        require(_beneficiary != address(0), "INVALID_ADDRESS");
        require(_totalAmount > 0, "INVALID_AMOUNT");
        require(
            ERC20(tokenAddress).allowance(msg.sender, address(this)) >=
                _totalAmount,
            "INVALID_ALLOWANCE"
        );
        ERC20(tokenAddress).transferFrom(
            msg.sender,
            address(this),
            _totalAmount
        );
        Claim memory newClaim = Claim({
            isActive: true,
            totalAmount: _totalAmount,
            startTime: _startTime,
            cliffTime: _cliffTime,
            endTime: _endTime,
            inUnlockedAmount: _inUnlockedAmount,
            amountClaimed: 0
        });
        claims[_beneficiary] = newClaim;
        emit ClaimCreated(
            msg.sender,
            _beneficiary,
            _totalAmount,
            _startTime,
            _cliffTime,
            _endTime
        );
    }

    function createClaim(
        address _beneficiary,
        uint256 _totalAmount,
        uint64 _startTime,
        uint256 _cliffTime,
        uint64 _endTime,
        uint256 _inUnlockedAmount
    ) external onlyAdmin {
        _createClaim(_beneficiary, _totalAmount, _startTime,_cliffTime, _endTime,_inUnlockedAmount);
    }

   function createBatchClaim(
       address[] memory _beneficiary,
        uint256[] memory _totalAmount,
        uint64 _startTime,
        uint256 _cliffTime,
        uint64 _endTime,
        uint256 _inUnlockedAmount
    ) external onlyAdmin {
        require(_beneficiary.length == _totalAmount.length,"Please enter the all parameters");
        for(uint256 i = 0; i<_beneficiary.length; i++){
            _createClaim(_beneficiary[i], _totalAmount[i], _startTime,_cliffTime, _endTime,_inUnlockedAmount);
        }
    }
    
    function getClaim(address beneficiary)
        external
        view
        returns (Claim memory)
    {
        require(beneficiary != address(0), "INVALID_ADDRESS");
        return (claims[beneficiary]);
    }

    function claimableAmount(address beneficiary)
        public
        view
        returns (uint256)
    {
        Claim memory _claim = claims[beneficiary];
        if (block.timestamp < _claim.startTime) return 0;
        if (block.timestamp > _claim.startTime && block.timestamp < _claim.startTime+_claim.cliffTime) return (_claim.inUnlockedAmount*_claim.totalAmount)/100;
        if (_claim.amountClaimed == _claim.totalAmount) return 0;
        if(block.timestamp > _claim.startTime+_claim.cliffTime)
        {   uint256 currentTimestamp = block.timestamp > _claim.endTime
                ? _claim.endTime
                : block.timestamp;
            uint256 claimPercent = currentTimestamp
            .sub(_claim.startTime)
            .mul(1e18)
            .div(_claim.endTime.sub(_claim.startTime));
            uint256 claimAmount = _claim.totalAmount.mul(claimPercent).div(1e18);
            uint256 unclaimedAmount = claimAmount.sub(_claim.amountClaimed);
        return unclaimedAmount;
        }
    }

    function claim() external {
        address beneficiary = msg.sender;
        Claim memory _claim = claims[beneficiary];
        require(_claim.isActive, "CLAIM_INACTIVE");
        require(_claim.amountClaimed != _claim.totalAmount, "CLAIM_COMPLETE");
        uint256 unclaimedAmount = claimableAmount(beneficiary);
        ERC20(tokenAddress).transfer(beneficiary, unclaimedAmount);
        _claim.amountClaimed = _claim.amountClaimed + unclaimedAmount;
        claims[beneficiary] = _claim;
        emit Claimed(beneficiary, unclaimedAmount);
    }

    function revoke(address beneficiary) external onlyAdmin {
        require(claims[beneficiary].isActive != false, "Already invalidated");
        claims[beneficiary].isActive = false;
        emit Revoked(beneficiary);
    }

    function withdrawTokens(address wallet) external onlyOwner {
        uint256 balance = ERC20(tokenAddress).balanceOf(address(this));
        require(balance > 0, "Nothing to withdraw");
        ERC20(tokenAddress).transfer(wallet, balance);
    }
}
