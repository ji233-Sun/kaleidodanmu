import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** 用户对作品的「投币」关系（独立表；投币单向，记录不可撤销）。 */
@Entity({ name: 'effect_coins' })
@Index('uq_effect_coins_user_effect', ['userId', 'effectId'], { unique: true })
@Index('idx_effect_coins_effect', ['effectId'])
export class EffectCoin {
  @PrimaryGeneratedColumn('increment', { type: 'integer', primaryKeyConstraintName: 'pk_effect_coins' })
  id!: number

  @Column({ name: 'user_id', type: 'integer', nullable: false })
  userId!: number

  @Column({ name: 'effect_id', type: 'integer', nullable: false })
  effectId!: number

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date
}
